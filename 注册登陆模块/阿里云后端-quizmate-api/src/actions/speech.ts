import crypto from "node:crypto";
import { CREDIT_COST_PER_INTERVIEW } from "../domain/credits.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import type { ActionDependencies, ActionHandler } from "../types.js";
import { DEFAULT_INTERVIEW_PROMPT } from "./configuration.js";
import { normalizeDeviceId } from "./licenses.js";

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
    answerStyle: raw.answerStyle === "detailed" ? "detailed" : "concise"
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

export function buildInterviewPrompt(
  question: string,
  context: InterviewContext,
  configuredPrompt = DEFAULT_INTERVIEW_PROMPT
): string {
  const detail = context.answerStyle === "detailed"
    ? "给出结构完整、可直接口述的详细回答"
    : "给出简洁、自然、可直接口述的回答，优先控制在 150 至 300 字";
  const answerLanguage = resolveAnswerLanguage(question, context.language);
  return [
    configuredPrompt.trim() || DEFAULT_INTERVIEW_PROMPT,
    detail + "。不要虚构简历中不存在的事实；信息不足时给出稳妥的通用表述。",
    `本次回答语言（必须遵守）：${answerLanguage}`,
    context.position ? `应聘岗位：${context.position}` : "",
    context.company ? `目标公司：${context.company}` : "",
    context.jobDescription ? `岗位描述：\n${context.jobDescription}` : "",
    context.resumeText ? `候选人简历：\n${context.resumeText}` : "",
    `面试官问题：${question}`,
    "仅输出 JSON，格式为：",
    '{"items":[{"summary":"问题摘要","answer":"可直接口述的回答","explanation":"回答要点，每个要点单独一行"}]}'
  ].filter(Boolean).join("\n\n");
}

function extractKeyPoints(explanation: string): string[] {
  return explanation
    .split(/\r?\n|[；;]/)
    .map((value) => value.replace(/^[-*•\d.、)）\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
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

  actions.set("generateInterviewAnswer", async (input) => {
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
    const result = await deps.runAnalysisModel({
      prompt: buildInterviewPrompt(question, interviewContext, configuredPrompt),
      pageContext: null,
      screenshot: "",
      source: "interview",
      mode: "interview"
    });
    const item = result.items[0];
    const answer = String(item?.answer || item?.explanation || result.note || "").trim();
    if (!answer) {
      throw new PublicError("AI 未返回有效的面试回答，请重试。", "INVALID_MODEL_RESULT", 502);
    }
    const keyPoints = extractKeyPoints(String(item?.explanation ?? ""));
    const requestId = `interview_${crypto.randomUUID()}`;
    return settleInterviewSuccess(
      deps,
      account.account_id,
      deviceId,
      requestId,
      answer,
      keyPoints
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
