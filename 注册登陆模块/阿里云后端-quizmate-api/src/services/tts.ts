import type { AppConfig } from "../config.js";
import { PublicError } from "../errors.js";

// 豆包语音合成大模型 - 统一配置方式（与文字模型配置对称）
// 配置字段：baseUrl + apiPath + model（音色 speaker）+ apiKey + systemPrompt + enabled
// 文档：https://www.volcengine.com/docs/6561/2528925

// 默认参数
const DEFAULT_BASE_URL = "https://openspeech.bytedance.com";
const DEFAULT_API_PATH = "/api/v3/plan/tts/unidirectional";
const DEFAULT_RESOURCE_ID = "seed-tts-2.0";
const DEFAULT_MODEL = "zh_female_vv_uranus_bigtts"; // 默认音色：知性女声
const DEFAULT_FORMAT = "mp3";
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_SPEECH_RATE = 0; // [-50, 100]，0 = 1.0 倍速
const DEFAULT_LOUDNESS_RATE = 0; // [-50, 100]，0 = 1.0 倍音量
const DEFAULT_EMOTION = ""; // 空字符串表示不启用情感
const DEFAULT_EMOTION_SCALE = 0; // 0 表示不启用

// 综合 analyze 提示词场景：答案可能含字母选项/数字/公式，需要朗读优化
const DEFAULT_TTS_SYSTEM_PROMPT =
  "用标准普通话清晰朗读。遇到单选答案的字母读成\"选项A\"格式，例如答案\"B\"读成\"选项B\"。" +
  "遇到数字读全称，例如\"10\"读成\"十\"。遇到公式用自然语言描述。遇到英文单词按标准发音朗读。" +
  "语气平和专业，语速适中，不要朗读 Markdown 符号。";

export interface TtsSetting {
  baseUrl: string;
  apiPath: string;
  model: string;        // 音色 speaker ID
  apiKey: string;       // 豆包 API Key（从控制台 API Key 管理获取）
  resourceId: string;   // 资源 ID（豆包语音合成模型 2.0）
  enabled: boolean;
  systemPrompt: string;
}

export interface SpeakRequest {
  text: string;
  // 可选覆盖参数，未传则用默认值
  speaker?: string;      // 覆盖 model 音色
  format?: string;
  sampleRate?: number;
  speechRate?: number;
  loudnessRate?: number;
  emotion?: string;
  emotionScale?: number;
  disableMarkdownFilter?: boolean;
}

export interface SpeakResult {
  audioBase64: string;
  format: string;
  durationMs: number;
  charCount: number;
}

type TtsSettingLoader = () => Promise<Record<string, unknown>>;

// 运行时 setting 优先 -> 环境变量回退（与 model.ts 的 resolveXxxModel 模式一致）
function resolveTtsSetting(config: AppConfig, setting: Record<string, unknown>): TtsSetting {
  const configuredApiPath = String(setting.apiPath ?? process.env.VOLC_TTS_API_PATH ?? DEFAULT_API_PATH).trim();
  const configuredResourceId = String(setting.resourceId ?? process.env.VOLC_TTS_RESOURCE_ID ?? DEFAULT_RESOURCE_ID).trim();
  return {
    baseUrl: String(setting.baseUrl ?? process.env.VOLC_TTS_BASE_URL ?? DEFAULT_BASE_URL).trim(),
    apiPath: configuredApiPath === "/api/v3/tts/unidirectional" ? DEFAULT_API_PATH : configuredApiPath,
    model: String(setting.model ?? process.env.VOLC_TTS_MODEL ?? DEFAULT_MODEL).trim(),
    apiKey: String(setting.apiKey ?? process.env.VOLC_TTS_API_KEY ?? "").trim(),
    resourceId: configuredResourceId === "volc.service_type.10029" ? DEFAULT_RESOURCE_ID : configuredResourceId,
    enabled: setting.enabled === undefined ? true : Boolean(setting.enabled),
    systemPrompt: String(setting.systemPrompt ?? "").trim() || DEFAULT_TTS_SYSTEM_PROMPT
  };
}

function resolveEndpoint(setting: TtsSetting): string {
  // 拼接 baseUrl + apiPath，避免重复斜杠
  const base = setting.baseUrl.replace(/\/+$/, "");
  const path = setting.apiPath.startsWith("/") ? setting.apiPath : "/" + setting.apiPath;
  return base + path;
}

function normalizeText(value: unknown, max = 3000): string {
  // 移除 Markdown 控制符，避免朗读 "星星"
  const cleaned = String(value ?? "")
    .replace(/[*_`#>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, max);
}

function buildAdditions(setting: TtsSetting, request: SpeakRequest): string {
  // additions 是豆包 TTS 的扩展参数，context_texts 用于语音指令
  const additions: Record<string, unknown> = {
    disable_markdown_filter: request.disableMarkdownFilter ?? true
  };
  if (setting.systemPrompt) {
    additions.context_texts = [setting.systemPrompt];
  }
  return JSON.stringify(additions);
}

export function createTtsService(config: AppConfig, settingLoader?: TtsSettingLoader) {
  return async (request: SpeakRequest): Promise<SpeakResult> => {
    const startedAt = Date.now();
    const text = normalizeText(request.text);
    if (!text) throw new PublicError("没有可播报的文本。", "TTS_EMPTY_TEXT", 400);

    const setting = settingLoader ? await settingLoader() : {};
    const resolved = resolveTtsSetting(config, setting);
    if (!resolved.enabled) {
      throw new PublicError("语音播报功能已被管理员关闭。", "TTS_DISABLED", 503);
    }
    if (!resolved.apiKey) {
      throw new PublicError("后端语音模型配置不完整（缺少 API Key），请联系管理员。", "TTS_NOT_CONFIGURED", 503);
    }

    const endpoint = resolveEndpoint(resolved);
    const requestId = crypto.randomUUID();
    // speaker 优先用客户端请求参数，回退到后端 model 配置
    const speaker = String(request.speaker ?? (resolved.model || DEFAULT_MODEL));
    const format = String(request.format ?? DEFAULT_FORMAT).toLowerCase();
    const sampleRate = Number(request.sampleRate ?? DEFAULT_SAMPLE_RATE);
    const speechRate = Number(request.speechRate ?? DEFAULT_SPEECH_RATE);
    const loudnessRate = Number(request.loudnessRate ?? DEFAULT_LOUDNESS_RATE);
    const emotion = String(request.emotion ?? DEFAULT_EMOTION).trim();
    const emotionScale = Number(request.emotionScale ?? DEFAULT_EMOTION_SCALE);
    const additions = buildAdditions(resolved, request);

    // 构造 audio_params（情感参数仅在有值时加入）
    const audioParams: Record<string, unknown> = {
      format,
      sample_rate: sampleRate,
      speech_rate: speechRate,
      loudness_rate: loudnessRate
    };
    if (emotion) {
      audioParams.emotion = emotion;
      audioParams.emotion_scale = emotionScale || 1;
    }

    const body = JSON.stringify({
      user: { uid: "quizmate" },
      req_params: {
        text,
        speaker,
        audio_params: audioParams,
        additions
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      // 鉴权：X-Api-Key（简化方式，从控制台 API Key 管理获取）
      // 同时发送 X-Api-Resource-Id 指定模型版本
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": resolved.apiKey,
        "x-api-resource-id": resolved.resourceId,
        "x-api-request-id": requestId
      };
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new PublicError(
          `语音合成失败：${response.status} ${errText.slice(0, 200)}`,
          "TTS_UPSTREAM_ERROR",
          502
        );
      }

      // 单向流式接口返回二进制音频流（chunked），一次性读取完整 buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer.length) {
        throw new PublicError("语音合成返回空数据。", "TTS_EMPTY_AUDIO", 502);
      }

      return {
        audioBase64: buffer.toString("base64"),
        format,
        durationMs: Date.now() - startedAt,
        charCount: text.length
      };
    } catch (error) {
      if (error instanceof PublicError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PublicError("语音合成超时，请重试。", "TTS_TIMEOUT", 504);
      }
      throw new PublicError("语音合成服务暂时不可用。", "TTS_UPSTREAM_ERROR", 502);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export type TtsService = ReturnType<typeof createTtsService>;
