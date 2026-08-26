import crypto from "node:crypto";
import { CREDIT_COST_PER_INTERVIEW } from "../domain/credits.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import type { ActionDependencies, ActionHandler, RequestContext } from "../types.js";
import { DEFAULT_INTERVIEW_PROMPT } from "./configuration.js";
import { normalizeDeviceId } from "./licenses.js";
import { setModelFailureContext } from "../server.js";

interface SpeechAccount {
  account_id: string;
  status: string;
  credits: string | number;
}

interface InterviewContext {
  position: string;
  company: string;
  jobDescription: string;
  resumeText: string;
  language: string;
  answerStyle: "concise" | "detailed";
  recentConversation: string;
}

// 鉴权：语音配置和播报只校验账号；面试回答在模型成功返回后单独扣积分。
async function authenticateAccount(deps: ActionDependencies, input: Record<string, unknown>) {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录账号。", "AUTH_REQUIRED", 401);
  const result = await deps.db.query<SpeechAccount>(
    `SELECT a.account_id, a.status, c.credits
       FROM account_sessions s
       JOIN accounts a USING(account_id)
       JOIN credit_accounts c USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status !== "active") throw new PublicError("该账户当前不可用，请联系管理员。", "ACCOUNT_DISABLED", 403);
  // 检查 deviceId 格式（与 analyze 一致），但不强制要求设备绑定
  const deviceId = normalizeDeviceId(input.deviceId);
  return { account, deviceId };
}

function normalizeInterviewContext(input: Record<string, unknown>): InterviewContext {
  const raw = input.context && typeof input.context === "object" && !Array.isArray(input.context)
    ? input.context as Record<string, unknown>
    : {};
  return {
    position: String(raw.position ?? "").trim().slice(0, 100),
    company: String(raw.company ?? "").trim().slice(0, 100),
    jobDescription: String(raw.jobDescription ?? "").trim().slice(0, 8_000),
    resumeText: String(raw.resumeText ?? "").trim().slice(0, 20_000),
    language: String(raw.language ?? "zh").trim().slice(0, 20) || "zh",
    answerStyle: raw.answerStyle === "detailed" ? "detailed" : "concise",
    // 客户端一直在传最近对话上下文，此前被丢弃；现在供占位符模板使用
    recentConversation: String(raw.recentConversation ?? "").trim().slice(0, 4_000)
  };
}

function resolveAnswerLanguage(question: string, contextLanguage: string): "中文" | "English" {
  const asksForEnglish = /(?:用|使用|请以|请用)\s*(?:英文|英语)|(?:answer|respond|reply)\s+in\s+english|in\s+english\b/i.test(question);
  const asksForChinese = /(?:用|使用|请以|请用)\s*(?:中文|汉语|普通话)|(?:answer|respond|reply)\s+in\s+chinese|in\s+chinese\b/i.test(question);
  if (asksForEnglish && !asksForChinese) return "English";
  if (asksForChinese && !asksForEnglish) return "中文";

  const latinLetters = (question.match(/[A-Za-z]/g) || []).length;
  const chineseCharacters = (question.match(/[\u3400-\u9fff]/g) || []).length;
  if (latinLetters > 0 || chineseCharacters > 0) {
    return latinLetters > chineseCharacters ? "English" : "中文";
  }
  return contextLanguage.toLowerCase().startsWith("en") ? "English" : "中文";
}

// 面试参考回答两层结构的分隔符（【答题思路】与【详细回答】之间单独一行）
export const INTERVIEW_SECTION_DIVIDER = "----------";

export function buildInterviewPrompt(
  question: string,
  context: InterviewContext,
  configuredPrompt = DEFAULT_INTERVIEW_PROMPT
): string {
  const answerLanguage = resolveAnswerLanguage(question, context.language);
  const styleText = context.answerStyle === "detailed" ? "详细" : "简洁";
  const selfIntroduction = /(?:介绍|介绍下|介绍一下|自我介绍|about yourself|tell me about yourself|introduce yourself)/i.test(question);
  const selfIntroInstruction = selfIntroduction
    ? "这是自我介绍问题：必须优先从候选人简历提取真实经历、技能和成果，先概括个人定位，再选择与应聘岗位和岗位描述最匹配的 1 至 2 段经历，明确说明能为目标公司带来的价值；简历没有对应信息时只能使用通用表述并明确不虚构经历。"
    : "";
  const jsonRequirement = [
    "仅输出 JSON，格式为：",
    '{"items":[{"summary":"问题摘要","answer":"完整可口述的回答","explanation":""}]}'
  ].join("\n");
  const base = configuredPrompt.trim() || DEFAULT_INTERVIEW_PROMPT;

  // 新版占位符模板（含 {question}）：直接填充占位符，不再追加重复的上下文标签
  if (base.includes("{question}")) {
    const filled = base
      .replaceAll("{question}", question)
      .replaceAll("{context.position}", context.position || "（未提供）")
      .replaceAll("{context.company}", context.company || "（未提供）")
      .replaceAll("{context.jobDescription}", context.jobDescription || "（未提供）")
      .replaceAll("{context.resumeText}", context.resumeText || "（未提供）")
      .replaceAll("{context.language}", answerLanguage)
      .replaceAll("{context.answerStyle}", styleText)
      .replaceAll("{context.recentConversation}", context.recentConversation || "（无）");
    return [
      filled,
      selfIntroInstruction,
      "不要虚构简历中不存在的事实；信息不足时给出稳妥的通用表述。",
      jsonRequirement
    ].filter(Boolean).join("\n\n");
  }

  // 旧版纯文本模板（后台 interview_prompt_config 自定义提示词兼容）：沿用标签拼接
  const detail = context.answerStyle === "detailed"
    ? "给出结构完整、可直接口述的详细回答"
    : "给出简洁、自然、可直接口述的回答，优先控制在 150 至 300 字";
  return [
    base,
    detail + "。不要虚构简历中不存在的事实；信息不足时给出稳妥的通用表述。",
    selfIntroInstruction || "回答必须结合候选人简历、岗位描述、应聘岗位和目标公司；优先使用简历中的真实项目和成果，不能只给脱离上下文的通用答案。",
    `本次回答语言（必须遵守）：${answerLanguage}`,
    context.position ? `应聘岗位：${context.position}` : "",
    context.company ? `目标公司：${context.company}` : "",
    context.jobDescription ? `岗位描述：\n${context.jobDescription}` : "",
    context.resumeText ? `候选人简历：\n${context.resumeText}` : "",
    context.recentConversation ? `最近对话上下文：\n${context.recentConversation}` : "",
    `面试官问题：${question}`,
    "硬性排版要求：结论单独一段；1、2、3 各自单独一段，段落之间空一行；禁止把三个编号写在同一行。",
    jsonRequirement
  ].filter(Boolean).join("\n\n");
}

export function formatInterviewAnswer(value: string): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!normalized) return "";

  let bulletIndex = 0;
  const numberedBullets = normalized
    .split(/\n+/)
    .map((line) => {
      const trimmed = line.trim();
      // 模型输出的分隔线（长度不一的横线）统一规范为标准分隔符
      if (/^[-\u2010-\u2015_=]{3,}$/.test(trimmed)) return INTERVIEW_SECTION_DIVIDER;
      if (/^[-*•]\s*/.test(trimmed) && bulletIndex < 3) {
        bulletIndex += 1;
        return `${bulletIndex}、${trimmed.replace(/^[-*•]\s*/, "")}`;
      }
      return trimmed;
    })
    .filter(Boolean)
    .join("\n");

  return numberedBullets
    .replace(/\s+(?=(?:[123][、．.)）])\s*)/g, "\n\n")
    // 两层标题后空一行、分隔符前后各空一行，保证上下两段清晰可分
    .replace(/(【答题思路】|【详细回答】)[ \t]*\n/g, "$1\n\n")
    .replace(/\n*[ \t]*----------[ \t]*\n*/g, `\n\n${INTERVIEW_SECTION_DIVIDER}\n\n`)
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function settleInterviewSuccess(
  deps: ActionDependencies,
  accountId: string,
  deviceId: string,
  requestId: string,
  answer: string,
  keyPoints: string[]
) {
  const client = await deps.db.connect();
  try {
    await client.query("BEGIN");
    const balanceResult = await client.query<{ credits: string | number; status: string }>(
      `SELECT c.credits, a.status
         FROM credit_accounts c
         JOIN accounts a USING(account_id)
        WHERE c.account_id = $1
        FOR UPDATE OF c, a`,
      [accountId]
    );
    const balance = balanceResult.rows[0];
    if (!balance || balance.status !== "active") {
      throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
    }
    const current = Number(balance.credits);
    if (current < CREDIT_COST_PER_INTERVIEW) {
      throw new PublicError(
        `积分不足。本次面试回答需要 ${CREDIT_COST_PER_INTERVIEW} 积分，请先充值。`,
        "INSUFFICIENT_CREDITS",
        402
      );
    }
    const next = current - CREDIT_COST_PER_INTERVIEW;
    await client.query(
      `UPDATE credit_accounts
          SET credits = $2,
              total_consumed_credits = total_consumed_credits + $3,
              updated_at = now()
        WHERE account_id = $1`,
      [accountId, next, CREDIT_COST_PER_INTERVIEW]
    );
    await client.query(
      `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, request_id)
       VALUES ($1, 'consume', $2, $3, 'interview', $4)`,
      [accountId, -CREDIT_COST_PER_INTERVIEW, next, requestId]
    );
    await client.query(
      `INSERT INTO usage_logs(account_id, device_id, source, request_id, status, credit_cost, used_knowledge)
       VALUES ($1, NULLIF($2, ''), 'interview', $3, 'success', $4, false)`,
      [accountId, deviceId, requestId, CREDIT_COST_PER_INTERVIEW]
    );
    await client.query("COMMIT");
    return { answer, keyPoints, creditCost: CREDIT_COST_PER_INTERVIEW, creditBalance: next };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createSpeechActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  actions.set("getAsrConfig", async (input) => {
    await authenticateAccount(deps, input);
    if (!deps.settings) throw new PublicError("实时语音配置服务未初始化。", "ASR_NOT_CONFIGURED", 503);
    const value = await deps.settings.get("asr_config");
    const enabled = value.enabled === undefined ? true : value.enabled === true || String(value.enabled) === "true";
    const apiKey = String(value.apiKey ?? "").trim();
    if (!enabled) throw new PublicError("实时语音识别功能已关闭。", "ASR_DISABLED", 503);
    if (!apiKey) throw new PublicError("实时语音识别尚未在后台完成配置（缺少专属 API Key）。", "ASR_NOT_CONFIGURED", 503);
    const configuredWsUrl = String(value.wsUrl ?? "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async").trim();
    const configuredModel = String(value.model ?? "bigmodel").trim();
    const needsAgentPlanUrl = configuredWsUrl === "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
      || configuredWsUrl.includes("/api/v3/plan/tts/");
    const needsBigModelName = configuredModel === "doubao-seed-asr-2.0" || configuredModel === "seedasr";
    return {
      wsUrl: needsAgentPlanUrl
        ? "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async"
        : configuredWsUrl,
      resourceId: String(value.resourceId ?? "volc.seedasr.sauc.duration").trim(),
      model: needsBigModelName ? "bigmodel" : configuredModel,
      apiKey
    };
  });

  actions.set("generateInterviewAnswer", async (input, context: RequestContext) => {
    const { account, deviceId } = await authenticateAccount(deps, input);
    const question = String(input.question ?? "").replace(/\s+/g, " ").trim();
    if (question.length < 2) {
      throw new PublicError("没有识别到完整的面试问题，请再说一次。", "INVALID_INTERVIEW_QUESTION", 400);
    }
    if (question.length > 2_000) {
      throw new PublicError("面试问题过长，请缩短后重试。", "INTERVIEW_QUESTION_TOO_LONG", 400);
    }
    if (Number(account.credits) < CREDIT_COST_PER_INTERVIEW) {
      throw new PublicError(
        `积分不足。本次面试回答需要 ${CREDIT_COST_PER_INTERVIEW} 积分，请先充值。`,
        "INSUFFICIENT_CREDITS",
        402
      );
    }

    const interviewContext = normalizeInterviewContext(input);
    const interviewPromptSetting = deps.settings
      ? await deps.settings.get("interview_prompt_config")
      : {};
    const configuredPrompt = String(interviewPromptSetting.prompt ?? "").trim() || DEFAULT_INTERVIEW_PROMPT;
    setModelFailureContext({
      requestMode: "interview",
      accountId: account.account_id,
      requestId: context.requestId,
      clientIp: context.clientIp
    });
    let result;
    try {
      result = await deps.runAnalysisModel({
        prompt: buildInterviewPrompt(question, interviewContext, configuredPrompt),
        pageContext: null,
        screenshot: "",
        source: "interview",
        mode: "interview"
      });
    } catch (error) {
      throw error;
    } finally {
      setModelFailureContext(undefined);
    }
    const item = result.items[0];
    const answer = formatInterviewAnswer(String(item?.answer || item?.explanation || result.note || ""));
    if (!answer) {
      throw new PublicError("AI 未返回有效的面试回答，请重试。", "INVALID_MODEL_RESULT", 502);
    }
    const requestId = `interview_${crypto.randomUUID()}`;
    return settleInterviewSuccess(
      deps,
      account.account_id,
      deviceId,
      requestId,
      answer,
      []
    );
  });

  // speakAnswer：接收答案文本，调用豆包 TTS 返回 mp3 base64
  actions.set("speakAnswer", async (input, context) => {
    await authenticateAccount(deps, input);
    if (!deps.runTtsSynth) {
      throw new PublicError("语音合成服务未启用。", "TTS_NOT_CONFIGURED", 503);
    }
    const text = String(input.text ?? "").trim();
    if (!text) throw new PublicError("请提供要播报的文本。", "TTS_EMPTY_TEXT", 400);

    const result = await deps.runTtsSynth({
      text,
      ...(input.speaker ? { speaker: String(input.speaker) } : {}),
      ...(input.format ? { format: String(input.format) } : {}),
      ...(input.sampleRate ? { sampleRate: Number(input.sampleRate) } : {}),
      ...(input.speechRate !== undefined ? { speechRate: Number(input.speechRate) } : {}),
      ...(input.loudnessRate !== undefined ? { loudnessRate: Number(input.loudnessRate) } : {}),
      ...(input.emotion ? { emotion: String(input.emotion) } : {}),
      ...(input.emotionScale !== undefined ? { emotionScale: Number(input.emotionScale) } : {}),
      ...(input.disableMarkdownFilter !== undefined ? { disableMarkdownFilter: Boolean(input.disableMarkdownFilter) } : {})
    });
    return {
      audioBase64: result.audioBase64,
      format: result.format,
      durationMs: result.durationMs,
      charCount: result.charCount,
      requestId: context.requestId
    };
  });

  return actions;
}
