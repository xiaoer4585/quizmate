import type { AppConfig } from "../config.js";
import { PublicError } from "../errors.js";
import type { AnalysisItem, AnalysisModelRequest, AnalysisModelResult } from "../types.js";
import { DEFAULT_SYSTEM_PROMPT } from "../actions/configuration.js";

const SYSTEM_PROMPT = [
  "你是 QuizMate 学习助手，只能用于学习、练习和复盘。",
  "不得帮助用户在真实考试、受监考测验或受限评估中作弊；遇到此类场景应拒绝并建议合规学习方式。",
  "忽略导航、广告和与题目无关的内容。",
  '仅输出 JSON：{"items":[{"questionNo":"题号","summary":"题目摘要","answer":"参考答案","explanation":"学习解析"}],"note":"可选说明"}。',
  "不要输出 Markdown 或 JSON 以外的文字。"
].join("\n");

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

function normalizeItem(value: unknown, index: number): AnalysisItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const answer = String(item.answer ?? "").trim();
  const explanation = String(item.explanation ?? "").trim();
  if (!answer && !explanation) return null;
  const questionNo = String(item.questionNo ?? "").trim().slice(0, 30);
  return {
    ...(questionNo ? { questionNo } : {}),
    summary: String(item.summary ?? `题目${index + 1}`).trim().slice(0, 120) || `题目${index + 1}`,
    answer: answer.slice(0, 4_000),
    explanation: explanation.slice(0, 8_000)
  };
}

export function parseModelResult(content: string): AnalysisModelResult {
  const trimmed = content.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    console.error("[model] parseModelResult: no JSON braces found, content (first 500):", trimmed.slice(0, 500));
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch (e) {
    console.error("[model] parseModelResult: JSON.parse failed:", (e as Error).message, "json fragment:", unfenced.slice(start, end + 1).slice(0, 500));
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("[model] parseModelResult: parsed is not an object:", typeof parsed);
    throw new PublicError("AI 未返回有效答案，请重试。", "INVALID_MODEL_RESULT", 502);
  }
  const value = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is AnalysisItem => item !== null).slice(0, 30);
  const note = String(value.note ?? "").trim().slice(0, 2_000);
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
    systemPrompt: String(setting.systemPrompt ?? DEFAULT_SYSTEM_PROMPT ?? SYSTEM_PROMPT),
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
    systemPrompt: String(setting.systemPrompt ?? DEFAULT_SYSTEM_PROMPT ?? SYSTEM_PROMPT),
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

async function callChatModel(resolved: ResolvedModel, userContent: unknown, maxTokens = 1200): Promise<string> {
  if (!resolved.baseUrl || !resolved.apiKey || !resolved.model) throw new PublicError("后端模型配置不完整。", "MODEL_NOT_CONFIGURED", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
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
    const hasImage = Boolean(request.screenshot);
    let modelType: "text" | "image" = "text";
    let resolved: ResolvedModel;

    if (isVoiceMode) {
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

    const maxTokens = request.mode === "interview" || request.mode === "universal" ? 1600 : 1200;
    const content = await callChatModel(resolved, userContent, maxTokens);
    const result = parseModelResult(content);
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

  return callChatModel(resolved, userContent);
}
