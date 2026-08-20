import type { AppConfig } from "../config.js";
import { PublicError } from "../errors.js";
import type { AnalysisItem, AnalysisModelRequest, AnalysisModelResult } from "../types.js";
import { DEFAULT_SYSTEM_PROMPT } from "../actions/configuration.js";

const SYSTEM_PROMPT = [
  "你是 QuizMate 学习助手，只能用于学习、练习和复盘。",
  "不得帮助用户在真实考试、受监考测验或受限评估中作弊；遇到此类场景应拒绝并建议合规学习方式。",
  "忽略导航、广告和与题目无关的内容。",
  '仅输出 JSON：{"items":[{"questionNo":"题号","summary":"题目摘要","answer":"参考答案","explanation":"学习解析"}],"note":"可选说明"}。',
  "如果是编程题，必须继续使用上述 JSON，并在题目对象中增加 language、code、timeComplexity、spaceComplexity 字段；code 放完整可运行代码（JSON 字符串需正确转义），answer 在简短结论后也必须附上同一份完整代码，确保旧客户端可以直接显示。不要因为代码较长而省略代码。",
  "不要输出 Markdown 或 JSON 以外的文字。"
].join("\n");

// Appended even when an administrator has an older custom prompt saved.
const CODE_COMPATIBILITY_PROMPT = [
  "编程题兼容规则：仍只输出一个 JSON 对象。代码题的 item 必须包含 language、code、timeComplexity、spaceComplexity；code 放完整可运行代码，answer 必须在一句话结论后换行附上同一份完整代码，以兼容只显示 answer 的旧客户端。代码中的换行、引号和反斜杠必须正确 JSON 转义，不得省略代码。",
  "若模型无法生成合法 JSON，至少返回可识别的代码文本，避免返回空答案。"
].join("\n");

function withCodeCompatibility(prompt: unknown, fallback: string): string {
  const base = String(prompt ?? "").trim() || fallback;
  return `${base}\n${CODE_COMPATIBILITY_PROMPT}`;
}

// 语音播报模式专用提示词：只输出答案，不输出题目摘要和解析，减少 token 加快响应
// 答案以"请注意答案是"开头，语音播报时更自然
const VOICE_SYSTEM_PROMPT = [
  "你是 QuizMate 学习助手，只能用于学习、练习和复盘。",
  "不得帮助用户在真实考试、受监考测验或受限评估中作弊；遇到此类场景应拒绝并建议合规学习方式。",
  "忽略导航、广告和与题目无关的内容。",
  "只需给出答案，不要输出题目摘要和解析。",
  '答案必须以"请注意答案是"开头，然后直接给出答案内容。',
  '仅输出 JSON：{"items":[{"answer":"请注意答案是：参考答案"}],"note":"可选说明"}。',
  "答案要简洁准确，不要输出 Markdown 或 JSON 以外的文字。"
].join("\n");

const INTERVIEW_SYSTEM_PROMPT = [
  "你是 QuizMate 实时面试回答助手。",
  "快速判断面试官问题，按用户消息中的回答原则生成自然、专业、有逻辑、可直接口述的第一人称回答：普通问题结论先行、分点展开、简洁收尾；代码题、场景题、系统设计、技术原理等考题类问题先简述解题思路或分析框架，再展开细节并总结关键点。",
  "严格遵守用户消息中的语言、岗位、公司、岗位描述、简历、回答风格与长度要求，回答长度按问题复杂度自适应，不得虚构简历事实。",
  '仅输出 JSON：{"items":[{"summary":"问题摘要","answer":"完整可口述的回答","explanation":""}]}。',
  "不要输出思考过程、Markdown 或 JSON 之外的文字。"
].join("\n");

function normalizeItem(value: unknown, index: number): AnalysisItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const answer = String(item.answer ?? "").trim();
  const explanation = String(item.explanation ?? "").trim();
  const code = String(item.code ?? "").trim();
  if (!answer && !explanation && !code) return null;
  const displayAnswer = code && !answer.includes(code)
    ? `${answer || "参考代码"}\n${code}`
    : answer;
  const questionNo = String(item.questionNo ?? "").trim().slice(0, 30);
  return {
    ...(questionNo ? { questionNo } : {}),
    summary: String(item.summary ?? `题目${index + 1}`).trim().slice(0, 120) || `题目${index + 1}`,
    answer: displayAnswer.slice(0, 30_000),
    explanation: explanation.slice(0, 8_000),
    ...(code ? { code: code.slice(0, 30_000) } : {}),
    ...(String(item.language ?? "").trim() ? { language: String(item.language).trim().slice(0, 40) } : {}),
    ...(String(item.timeComplexity ?? "").trim() ? { timeComplexity: String(item.timeComplexity).trim().slice(0, 200) } : {}),
    ...(String(item.spaceComplexity ?? "").trim() ? { spaceComplexity: String(item.spaceComplexity).trim().slice(0, 200) } : {})
  };
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return value.slice(start, i + 1);
  }
  return "";
}

// 弱模型（如 doubao-seed-2.0-mini）常在 JSON 字符串值里输出裸换行/制表符等控制字符，
// 导致 JSON.parse 报 "Bad control character in string literal"。这里只对字符串字面量
// 内部的控制字符做转义（字符串外的 \n\r\t 是合法空白，保持原样）。
function escapeRawControlChars(json: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < json.length; i += 1) {
    const char = json.charAt(i);
    if (!inString) {
      if (char === "\"") inString = true;
      result += char;
      continue;
    }
    if (char === "\\") {
      // 转义对原样保留（含 \" \\ \n 等）
      result += char;
      if (i + 1 < json.length) {
        i += 1;
        result += json.charAt(i);
      }
      continue;
    }
    if (char === "\"") {
      inString = false;
      result += char;
      continue;
    }
    if (!char) continue;
    const code = char.charCodeAt(0);
    if (code < 0x20) {
      if (char === "\n") result += "\\n";
      else if (char === "\r") result += "\\r";
      else if (char === "\t") result += "\\t";
      else result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    result += char;
  }
  return result;
}

function fallbackCodeResult(content: string): AnalysisModelResult {
  const code = content.replace(/^```[^\r\n]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim().slice(0, 30_000);
  return { items: [{ summary: "题目1", answer: `参考代码\n${code}`, explanation: "", code }] };
}

export function parseModelResult(content: string, options: { allowInterviewText?: boolean } = {}): AnalysisModelResult {
  const trimmed = content.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const json = extractJsonObject(unfenced);
  if (!json) {
    console.error("[model] parseModelResult: no JSON braces found, content (first 500):", trimmed.slice(0, 500));
    if (options.allowInterviewText && trimmed) {
      return { items: [{ summary: "面试回答", answer: trimmed, explanation: "" }] };
    }
    if (trimmed && (/```|\b(function|class|def|public static|const|let|var)\b|#include\b|题目|答案/.test(trimmed))) {
      return fallbackCodeResult(trimmed);
    }
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // 先尝试对字符串值内的裸控制字符做容错转义再重试一次（线上实测高频失败原因）
    const sanitized = escapeRawControlChars(json);
    try {
      parsed = JSON.parse(sanitized);
    } catch (e) {
      console.error("[model] parseModelResult: JSON.parse failed:", (e as Error).message, "json fragment:", sanitized.slice(0, 500));
      if (options.allowInterviewText && trimmed) {
        return { items: [{ summary: "面试回答", answer: trimmed, explanation: "" }] };
      }
      if (/```|\b(function|class|def|public static|const|let|var)\b|#include\b/.test(trimmed)) {
        return fallbackCodeResult(trimmed);
      }
      throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("[model] parseModelResult: parsed is not an object:", typeof parsed);
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  const value = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is AnalysisItem => item !== null).slice(0, 30);
  const note = String(value.note ?? "").trim().slice(0, 2_000);
  if (!items.length && options.allowInterviewText) {
    const fallback = normalizeItem(value, 0);
    if (fallback) return { items: [fallback] };
  }
  if (!items.length && !note) {
    console.error("[model] parseModelResult: no items and no note, parsed keys:", Object.keys(value));
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  return { items, ...(note ? { note } : {}) };
}

type ModelSettingLoader = () => Promise<Record<string, unknown>>;

// 成功调用模型后回调，用于按天统计文本/图片模型调用次数（后台曲线图）
export type ModelCallRecorder = (info: { modelType: "text" | "image"; modelName: string }) => void;

interface ResolvedModel {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiPath: string;
  systemPrompt: string;
  temperature: number;
  apiFormat: "openai" | "anthropic";
}

// 文本类模型：优先用运行时配置 model_config，回退环境变量 MODEL_*
function resolveTextModel(config: AppConfig, setting: Record<string, unknown>): ResolvedModel {
  return {
    baseUrl: String(setting.baseUrl ?? config.MODEL_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: String(setting.apiKey ?? config.MODEL_API_KEY ?? ""),
    model: String(setting.model ?? config.MODEL_NAME ?? ""),
    apiPath: String(setting.apiPath ?? config.MODEL_API_PATH ?? "/v1/chat/completions"),
    systemPrompt: withCodeCompatibility(setting.systemPrompt, DEFAULT_SYSTEM_PROMPT ?? SYSTEM_PROMPT),
    temperature: Number(setting.temperature ?? 0.2),
    apiFormat: normalizeApiFormat(setting.apiFormat ?? config.MODEL_API_FORMAT)
  };
}

// 图片类模型：优先用运行时配置 image_model_config，回退环境变量 IMAGE_MODEL_*
function resolveImageModel(config: AppConfig, setting: Record<string, unknown>): ResolvedModel {
  return {
    baseUrl: String(setting.baseUrl ?? config.IMAGE_MODEL_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: String(setting.apiKey ?? config.IMAGE_MODEL_API_KEY ?? ""),
    model: String(setting.model ?? config.IMAGE_MODEL_NAME ?? ""),
    apiPath: String(setting.apiPath ?? config.IMAGE_MODEL_API_PATH ?? "/v1/chat/completions"),
    systemPrompt: withCodeCompatibility(setting.systemPrompt, DEFAULT_SYSTEM_PROMPT ?? SYSTEM_PROMPT),
    temperature: Number(setting.temperature ?? 0.2),
    apiFormat: normalizeApiFormat(setting.apiFormat ?? config.IMAGE_MODEL_API_FORMAT)
  };
}

// 语音模式专用模型：优先用运行时配置 voice_model_config，回退到图片模型配置
// 提示词使用 VOICE_SYSTEM_PROMPT（只输出答案，不输出题目摘要和解析）
function resolveVoiceModel(config: AppConfig, setting: Record<string, unknown>): ResolvedModel {
  return {
    baseUrl: String(setting.baseUrl ?? config.IMAGE_MODEL_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: String(setting.apiKey ?? config.IMAGE_MODEL_API_KEY ?? ""),
    model: String(setting.model ?? config.IMAGE_MODEL_NAME ?? ""),
    apiPath: String(setting.apiPath ?? config.IMAGE_MODEL_API_PATH ?? "/v1/chat/completions"),
    systemPrompt: String(setting.systemPrompt ?? VOICE_SYSTEM_PROMPT),
    temperature: Number(setting.temperature ?? 0.2),
    apiFormat: normalizeApiFormat(setting.apiFormat ?? config.IMAGE_MODEL_API_FORMAT)
  };
}

function normalizeApiFormat(value: unknown): "openai" | "anthropic" {
  return String(value ?? "openai").toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

async function callChatModel(
  resolved: ResolvedModel,
  userContent: unknown,
  maxTokens = 1200,
  options: { disableThinking?: boolean } = {}
): Promise<string> {
  if (!resolved.baseUrl || !resolved.apiKey || !resolved.model) throw new PublicError("后端模型配置不完整。", "MODEL_NOT_CONFIGURED", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const url = `${resolved.baseUrl}${resolved.apiPath.startsWith("/") ? resolved.apiPath : `/${resolved.apiPath}`}`;
    const isAnthropic = resolved.apiFormat === "anthropic";
    const headers: Record<string, string> = { "content-type": "application/json" };
    let body: string;
    if (isAnthropic) {
      headers["x-api-key"] = resolved.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = JSON.stringify({
        model: resolved.model,
        max_tokens: maxTokens,
        temperature: Number.isFinite(resolved.temperature) ? Math.max(0, Math.min(2, resolved.temperature)) : 0.2,
        system: resolved.systemPrompt || SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }]
      });
    } else {
      headers.authorization = `Bearer ${resolved.apiKey}`;
      body = JSON.stringify({
        model: resolved.model,
        max_tokens: maxTokens,
        temperature: Number.isFinite(resolved.temperature) ? Math.max(0, Math.min(2, resolved.temperature)) : 0.2,
        ...(options.disableThinking ? { thinking: { type: "disabled" } } : {}),
        messages: [
          { role: "system", content: resolved.systemPrompt || SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ]
      });
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      console.error("[model] upstream error:", response.status, await response.text().catch(() => ""));
      throw new PublicError("AI 服务暂时不可用，请稍后重试。", "MODEL_UPSTREAM_ERROR", 502);
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      content?: Array<{ type?: string; text?: string }>;
    };
    // OpenAI: choices[0].message.content / Anthropic: content 数组中第一个 text block
    const content = isAnthropic
      ? String(payload.content?.find((block) => block.type === "text")?.text ?? "")
      : String(payload.choices?.[0]?.message?.content ?? "");
    if (!content) {
      console.error("[model] empty content, full payload:", JSON.stringify(payload).slice(0, 500));
      throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
    }
    console.log("[model] raw content (first 300 chars):", content.slice(0, 300));
    return content;
  } catch (error) {
    if (error instanceof PublicError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PublicError("AI 分析超时，请重试。", "MODEL_TIMEOUT", 504);
    }
    throw new PublicError("AI 服务暂时不可用，请稍后重试。", "MODEL_UPSTREAM_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
}

// 根据API格式构建图片内容：OpenAI用image_url，Anthropic用image source
function buildImageContent(apiFormat: "openai" | "anthropic", text: string, screenshot: string): unknown {
  const promptText = text || "请分析图片中的学习题目。";
  if (apiFormat === "anthropic") {
    // Anthropic Messages: image 块在前，text 块在后
    const dataUrlMatch = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is.exec(screenshot);
    if (dataUrlMatch) {
      return [
        { type: "image", source: { type: "base64", media_type: dataUrlMatch[1], data: dataUrlMatch[2] } },
        { type: "text", text: promptText }
      ];
    }
    if (/^https:\/\//i.test(screenshot)) {
      return [
        { type: "image", source: { type: "url", url: screenshot } },
        { type: "text", text: promptText }
      ];
    }
    // 裸 base64，默认 png
    return [
      { type: "image", source: { type: "base64", media_type: "image/png", data: screenshot } },
      { type: "text", text: promptText }
    ];
  }
  // OpenAI Chat Completions: text 块在前，image_url 块在后
  const imageUrl = screenshot.startsWith("data:")
    ? screenshot
    : /^https:\/\//i.test(screenshot)
      ? screenshot
      : `data:image/png;base64,${screenshot}`;
  return [
    { type: "text", text: promptText },
    { type: "image_url", image_url: { url: imageUrl } }
  ];
}

export function createAnalysisModel(
  config: AppConfig,
  textLoader?: ModelSettingLoader,
  imageLoader?: ModelSettingLoader,
  voiceLoader?: ModelSettingLoader,
  recorder?: ModelCallRecorder
) {
  return async (request: AnalysisModelRequest): Promise<AnalysisModelResult> => {
    const isVoiceMode = request.mode === "voice";
    const isInterviewMode = request.mode === "interview";
    const hasImage = Boolean(request.screenshot);
    let modelType: "text" | "image" = "text";
    let resolved: ResolvedModel;

    if (isInterviewMode) {
      // 面试强调低延迟，复用后台已配置的快速语音回答模型连接，但使用独立面试提示词。
      const voiceSetting = voiceLoader ? await voiceLoader() : {};
      const interviewResolved = resolveVoiceModel(config, voiceSetting);
      if (interviewResolved.baseUrl && interviewResolved.apiKey && interviewResolved.model) {
        resolved = interviewResolved;
      } else {
        const textSetting = textLoader ? await textLoader() : {};
        resolved = resolveTextModel(config, textSetting);
      }
      resolved.systemPrompt = INTERVIEW_SYSTEM_PROMPT;
    } else if (isVoiceMode) {
      // 语音播报模式：优先用 voice_model_config，未配置则回退到 image_model_config
      const voiceSetting = voiceLoader ? await voiceLoader() : {};
      const voiceResolved = resolveVoiceModel(config, voiceSetting);
      if (voiceResolved.baseUrl && voiceResolved.apiKey && voiceResolved.model) {
        resolved = voiceResolved;
        modelType = hasImage ? "image" : "text";
      } else if (hasImage) {
        // voice_model_config 未配置，回退到图片模型
        const imageSetting = imageLoader ? await imageLoader() : {};
        const imageResolved = resolveImageModel(config, imageSetting);
        if (imageResolved.baseUrl && imageResolved.apiKey && imageResolved.model) {
          modelType = "image";
          resolved = imageResolved;
          // 覆盖提示词为 voice 专用
          resolved.systemPrompt = imageResolved.systemPrompt || VOICE_SYSTEM_PROMPT;
        } else {
          const textSetting = textLoader ? await textLoader() : {};
          resolved = resolveTextModel(config, textSetting);
          resolved.systemPrompt = VOICE_SYSTEM_PROMPT;
        }
      } else {
        const textSetting = textLoader ? await textLoader() : {};
        resolved = resolveTextModel(config, textSetting);
        resolved.systemPrompt = VOICE_SYSTEM_PROMPT;
      }
    } else if (hasImage) {
      // 非语音模式：有图片时优先用图片模型；若图片模型未配置，回退到文字模型
      const imageSetting = imageLoader ? await imageLoader() : {};
      const imageResolved = resolveImageModel(config, imageSetting);
      if (imageResolved.baseUrl && imageResolved.apiKey && imageResolved.model) {
        modelType = "image";
        resolved = imageResolved;
      } else {
        const textSetting = textLoader ? await textLoader() : {};
        resolved = resolveTextModel(config, textSetting);
      }
    } else {
      const textSetting = textLoader ? await textLoader() : {};
      resolved = resolveTextModel(config, textSetting);
    }

    const context = typeof request.pageContext === "string"
      ? request.pageContext
      : request.pageContext
        ? JSON.stringify(request.pageContext)
        : "";
    const imageHint = hasImage && request.source === "screen"
      ? "截图中若包含图表、坐标轴、统计图、表格、几何图形、流程图或‘如下图/图中’等描述，必须同时理解图形结构、数值、趋势和选项关系，不得只按 OCR 文字猜题。"
      : "";
    const text = [request.prompt, imageHint, context].filter(Boolean).join("\n\n").slice(0, 60_000);
    const userContent = hasImage
      ? buildImageContent(resolved.apiFormat, text, request.screenshot)
      : text;

    // 面试模式为非流式调用，耗时与输出长度成正比：上限收紧保证最坏耗时（提示词要求长度按复杂度自适应）
    const maxTokens = request.mode === "interview"
      ? 1200
      : request.mode === "universal"
        ? 1600
      : hasImage ? 4000 : 1800;
    const content = await callChatModel(resolved, userContent, maxTokens, { disableThinking: true });
    const result = parseModelResult(content, { allowInterviewText: isInterviewMode });
    // 仅在成功调用后记录，用于后台模型调用曲线图
    if (recorder) recorder({ modelType, modelName: resolved.model });
    return result;
  };
}

/**
 * 错题集小程序专用：用自定义系统提示词调用 AI 模型，返回原始文本（不解析 JSON）
 * 有图片时用图片模型，无图片时用文本模型
 */
export async function callCuotiModel(
  config: AppConfig,
  textLoader: ModelSettingLoader,
  imageLoader: ModelSettingLoader,
  request: {
    prompt: string;
    screenshot?: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const hasImage = Boolean(request.screenshot);
  let resolved: ResolvedModel;

  if (hasImage) {
    const imageSetting = await imageLoader();
    resolved = resolveImageModel(config, imageSetting);
  } else {
    const textSetting = await textLoader();
    resolved = resolveTextModel(config, textSetting);
  }

  // 覆盖系统提示词
  resolved.systemPrompt = request.systemPrompt;
  if (request.temperature !== undefined) resolved.temperature = request.temperature;

  const text = request.prompt || "";
  const userContent = hasImage
    ? buildImageContent(resolved.apiFormat, text, request.screenshot!)
    : text;

  return callChatModel(resolved, userContent, request.maxTokens ?? 1200, { disableThinking: true });
}
