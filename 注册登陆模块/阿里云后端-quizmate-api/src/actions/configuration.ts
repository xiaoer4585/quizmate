import { PublicError } from "../errors.js";
import { paymentReadiness, type PaymentRuntimeConfig } from "../payments/config.js";
import { maskSecret, requireAdmin } from "../services/admin.js";
import { authenticateAdmin } from "./admin.js";
import type { RuntimeSetting } from "../services/runtime-settings.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

export const DEFAULT_SYSTEM_PROMPT =
  '你是一个学习助手。你只能用于学习、练习和复盘场景，不能帮助用户在真实考试、测验或受限评估中作弊。若内容中包含练习题，请忽略导航、广告、页脚和与题目无关的信息，只提取题目相关内容，并仅输出 JSON：{"items":[{"summary":"题目摘要，尽量不超过20个汉字，必要时用...结尾","answer":"参考答案","explanation":"学习解析"}],"note":"如不是题目可写简短说明"}。不要输出 Markdown，不要输出额外说明。';

export const DEFAULT_ANSWER_FORMAT_PROMPT = [
  "请严格按下面结构输出 JSON，不要输出 Markdown，不要输出 JSON 外的任何文字。",
  'JSON 格式：{"items":[{"questionNo":"页面原题号，如 10","summary":"题目10 或 问题10","answer":"只写明确答案，如 B","explanation":"简洁答案解析"}],"note":"非题目时的简短说明"}',
  "如果页面题目前有编号，例如“10、”“10.”“第10题”，questionNo 必须写 10，summary 写“题目10”。",
  "如果无法识别题号，按题目出现顺序写 1、2、3。",
  "answer 字段要极简明确，单选题优先只输出选项字母，例如 B。",
  "编程题必须兼容：在题目对象中增加 language、code、timeComplexity、spaceComplexity 字段；code 写完整可运行代码，answer 必须在简短结论后换行附上同一份完整代码，确保只显示 answer 的旧客户端也能看到代码。代码中的换行、引号和反斜杠必须正确 JSON 转义，不得省略代码或改用 Markdown 代码围栏。",
  "explanation 字段只写必要解析，不要重复大段题干。"
].join("\n");

export const DEFAULT_INTERVIEW_PROMPT = [
  "你是一名资深、专业、表达清晰的面试候选人，正在接受面试助手辅助回答。",
  "你的目标是：在面试官提问后，结合简历内容、目标岗位要求和题目本身，输出一段自然、流畅、结构化、像真实候选人一样的回答。",
  "回答原则：",
  "1. 始终以“候选人第一人称”表达，语气专业、自信、克制，不要像机器人背答案。",
  "2. 优先结合简历中的项目经历、技能栈、业务背景、岗位要求来回答，尽量贴合应聘岗位。",
  "3. 如果是技术岗，要站在“专家技术候选人”的角度回答，体现技术判断、工程思维、架构意识、性能意识、边界意识和取舍能力。",
  "4. 回答要有逻辑和结构，避免散、空、泛。优先使用“结论先行 - 分点展开 - 总结收尾”的方式。",
  "5. 对于普通面试问题，直接给出清晰、有层次的回答，并适当结合自身经历举例。",
  "6. 对于考题类问题，包括代码题、场景题、系统设计题、技术原理题等，必须先简述解题思路或分析框架，再逐步展开细节，最后总结关键点或复杂度、边界条件、风险点。",
  "7. 如果题目需要代码思路，先讲思路、数据结构、算法选择、时间复杂度、空间复杂度，再给实现方案。",
  "8. 如果题目需要场景分析，先明确目标和约束，再给方案、权衡、风险和落地方式。",
  "9. 如果题目涉及项目经历，优先把回答落到“我做了什么、为什么这么做、效果如何、有哪些取舍”。",
  "10. 不要编造简历里没有的经历、数据或项目细节。如果信息不足，用合理、稳妥的方式表达，不要硬编。",
  "11. 输出内容要适合直接在面试中口头表达，语言自然，句子不要过长，结构清晰，重点突出。",
  "12. 如果问题含义不明确，先简短复述你的理解，再开始回答。",
  "13. 回答长度根据问题复杂度自动调整，简单问题简洁回答，复杂问题分层展开，但不要冗长。",
  "推荐回答结构：",
  "- 普通问题：结论 -> 理由 -> 结合简历/经历 -> 小结",
  "- 技术问题：问题理解 -> 核心思路 -> 关键实现/原理 -> 边界与取舍 -> 总结",
  "- 代码题：思路 -> 数据结构/算法 -> 复杂度 -> 代码/伪代码思路 -> 边界情况",
  "- 场景题：目标 -> 方案 -> 权衡 -> 风险控制 -> 落地结果",
  "请始终根据以下输入作答：",
  "- 面试官问题：{question}",
  "- 应聘岗位：{context.position}",
  "- 目标公司：{context.company}",
  "- 岗位描述：{context.jobDescription}",
  "- 候选人简历：{context.resumeText}",
  "- 本次回答语言：{context.language}",
  "- 回答风格：{context.answerStyle}",
  "- 最近对话上下文：{context.recentConversation}"
].join("\n");

const DEFAULT_PURCHASE = {
  title: "在线购买授权",
  description: "请选择支付宝套餐完成购买，付款成功后会自动绑定当前设备。",
  imageUrl: "",
  purchaseUrl: "",
  buttonText: "",
  contactInfo: "请联系管理员购买序列号"
};

const DEFAULT_TUTORIAL = { title: "教学视频", videoUrl: "" };

export const DEFAULT_PAYMENT_SETTING: RuntimeSetting = {
  enabled: false,
  provider: "multi",
  appId: "",
  gatewayUrl: "https://openapi.alipay.com/gateway.do",
  appPrivateKey: "",
  alipayPublicKey: "",
  notifyUrl: "",
  returnUrl: "",
  qrCodeTimeoutExpress: "2h",
  orderTimeoutExpress: "2h",
  wechatEnabled: false,
  wechatProvider: "payjs",
  payjsMchId: "",
  payjsKey: "",
  payjsNativeUrl: "https://payjs.cn/api/native",
  payjsQueryUrl: "https://payjs.cn/api/check",
  payjsNotifyUrl: "",
  epayEnabled: false,
  epayApiUrl: "https://api.niman.cn/",
  epayPid: "",
  epayKey: "",
  epayMerchantPrivateKey: "",
  epayPlatformPublicKey: "",
  epayNotifyUrl: "",
  epayReturnUrl: "https://quizmate.cn/recharge.html",
  prices: { 30: "19.80", 90: "29.80", 365: "69.80" }
};

function settings(deps: ActionDependencies) {
  if (!deps.settings) throw new PublicError("运行配置服务尚未初始化。", "SETTINGS_NOT_CONFIGURED", 503);
  return deps.settings;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || String(value ?? "").toLowerCase() === "true" || String(value ?? "") === "1";
}

function text(value: unknown, fallback = "", max = 20_000): string {
  return String(value ?? fallback).trim().slice(0, max);
}

function publicPurchase(value: RuntimeSetting) {
  return {
    title: text(value.title, DEFAULT_PURCHASE.title, 120),
    description: text(value.description, DEFAULT_PURCHASE.description, 1_000),
    imageUrl: text(value.imageUrl, DEFAULT_PURCHASE.imageUrl, 2_000),
    purchaseUrl: text(value.purchaseUrl, DEFAULT_PURCHASE.purchaseUrl, 2_000),
    buttonText: text(value.buttonText, DEFAULT_PURCHASE.buttonText, 120),
    contactInfo: text(value.contactInfo, DEFAULT_PURCHASE.contactInfo, 300),
    updatedAt: text(value.updatedAt)
  };
}

function publicTutorial(value: RuntimeSetting) {
  return {
    title: text(value.title, DEFAULT_TUTORIAL.title, 120),
    videoUrl: text(value.videoUrl, DEFAULT_TUTORIAL.videoUrl, 2_000),
    updatedAt: text(value.updatedAt)
  };
}

export async function loadPaymentSetting(deps: ActionDependencies): Promise<RuntimeSetting> {
  const stored = await settings(deps).get("payment_config");
  return { ...DEFAULT_PAYMENT_SETTING, ...stored, prices: { ...(DEFAULT_PAYMENT_SETTING.prices as object), ...(stored.prices as object ?? {}) } };
}

export function paymentRuntimeFromSetting(value: RuntimeSetting): PaymentRuntimeConfig {
  return {
    alipay: {
      enabled: bool(value.enabled),
      appId: text(value.appId),
      gatewayUrl: text(value.gatewayUrl, "https://openapi.alipay.com/gateway.do"),
      privateKey: text(value.appPrivateKey, "", 20_000),
      publicKey: text(value.alipayPublicKey, "", 20_000),
      notifyUrl: text(value.notifyUrl)
    },
    payjs: {
      enabled: bool(value.wechatEnabled),
      mchId: text(value.payjsMchId),
      key: text(value.payjsKey),
      nativeUrl: text(value.payjsNativeUrl, "https://payjs.cn/api/native"),
      queryUrl: text(value.payjsQueryUrl, "https://payjs.cn/api/check"),
      notifyUrl: text(value.payjsNotifyUrl)
    },
    epay: {
      enabled: bool(value.epayEnabled),
      apiUrl: text(value.epayApiUrl, "https://api.niman.cn/"),
      pid: text(value.epayPid),
      key: text(value.epayKey),
      merchantPrivateKey: text(value.epayMerchantPrivateKey),
      platformPublicKey: text(value.epayPlatformPublicKey),
      notifyUrl: text(value.epayNotifyUrl),
      returnUrl: text(value.epayReturnUrl, "https://quizmate.cn/recharge.html")
    }
  };
}

export function publicPaymentSetting(value: RuntimeSetting) {
  const readiness = paymentReadiness(paymentRuntimeFromSetting(value));
  const prices = { ...(DEFAULT_PAYMENT_SETTING.prices as Record<string, unknown>), ...(value.prices as Record<string, unknown> ?? {}) };
  return {
    enabled: readiness.alipay || readiness.wechat,
    provider: "multi",
    methods: [
      { id: "alipay", label: "支付宝", brand: "支付宝官方扫码支付", accent: "#1677ff", help: "请使用支付宝 App 扫一扫完成付款", enabled: readiness.alipay },
      { id: "wechat", label: "微信支付", brand: "微信扫码支付", accent: "#07c160", help: "请使用微信 App 扫一扫完成付款", enabled: readiness.wechat }
    ],
    plans: [30, 90, 365].map((days) => ({
      days,
      label: days === 30 ? "月度授权" : days === 90 ? "季度授权" : "年度授权",
      description: `有效期 ${days} 天`,
      amount: Number(prices[String(days)] ?? prices[days] ?? 0).toFixed(2)
    }))
  };
}

function publicAdminPayment(value: RuntimeSetting) {
  const prices = { ...(DEFAULT_PAYMENT_SETTING.prices as Record<string, unknown>), ...(value.prices as Record<string, unknown> ?? {}) };
  return {
    enabled: bool(value.enabled), provider: "multi", appId: text(value.appId),
    gatewayUrl: text(value.gatewayUrl, "https://openapi.alipay.com/gateway.do"),
    appPrivateKeyMasked: maskSecret(value.appPrivateKey), alipayPublicKeyMasked: maskSecret(value.alipayPublicKey),
    hasAppPrivateKey: Boolean(value.appPrivateKey), hasAlipayPublicKey: Boolean(value.alipayPublicKey),
    notifyUrl: text(value.notifyUrl), returnUrl: text(value.returnUrl),
    qrCodeTimeoutExpress: text(value.qrCodeTimeoutExpress, "2h"), orderTimeoutExpress: text(value.orderTimeoutExpress, "2h"),
    wechatEnabled: bool(value.wechatEnabled), wechatProvider: "payjs", payjsMchId: text(value.payjsMchId),
    payjsKeyMasked: maskSecret(value.payjsKey), hasPayjsKey: Boolean(value.payjsKey),
    payjsNativeUrl: text(value.payjsNativeUrl, "https://payjs.cn/api/native"), payjsQueryUrl: text(value.payjsQueryUrl, "https://payjs.cn/api/check"), payjsNotifyUrl: text(value.payjsNotifyUrl),
    epayEnabled: bool(value.epayEnabled), epayApiUrl: text(value.epayApiUrl, "https://api.niman.cn/"), epayPid: text(value.epayPid),
    epayKeyMasked: maskSecret(value.epayKey), hasEpayKey: Boolean(value.epayKey),
    epayMerchantPrivateKeyMasked: maskSecret(value.epayMerchantPrivateKey), hasEpayMerchantPrivateKey: Boolean(value.epayMerchantPrivateKey),
    epayPlatformPublicKeyMasked: maskSecret(value.epayPlatformPublicKey), hasEpayPlatformPublicKey: Boolean(value.epayPlatformPublicKey),
    epayNotifyUrl: text(value.epayNotifyUrl), epayReturnUrl: text(value.epayReturnUrl),
    prices: { 30: Number(prices["30"] ?? 0).toFixed(2), 90: Number(prices["90"] ?? 0).toFixed(2), 365: Number(prices["365"] ?? 0).toFixed(2) },
    updatedAt: text(value.updatedAt)
  };
}

async function mergeAndSave(deps: ActionDependencies, key: string, input: ActionInput, allowed: readonly string[], preserveBlank: ReadonlySet<string> = new Set()) {
  await authenticateAdmin(deps, input);
  const current = await settings(deps).get(key);
  const next = mergeSetting(current, input, allowed, preserveBlank);
  await settings(deps).set(key, next, "admin");
  return next;
}

function mergeSetting(current: RuntimeSetting, input: ActionInput, allowed: readonly string[], preserveBlank: ReadonlySet<string> = new Set()) {
  const next: RuntimeSetting = { ...current };
  for (const name of allowed) {
    if (!(name in input)) continue;
    const value = input[name];
    if (preserveBlank.has(name) && !text(value)) continue;
    next[name] = value;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function createConfigurationActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  actions.set("adminGetModelConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const value = await settings(deps).get("model_config");
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt, DEFAULT_SYSTEM_PROMPT), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });
  actions.set("adminSetModelConfig", async (input) => {
    const value = await mergeAndSave(deps, "model_config", input, ["baseUrl", "apiPath", "apiFormat", "model", "temperature", "systemPrompt", "apiKey"], new Set(["apiKey"]));
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt, DEFAULT_SYSTEM_PROMPT), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });

  // 图片输入类模型配置（截图/带图题目时使用，独立于文本模型）
  actions.set("adminGetImageModelConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const value = await settings(deps).get("image_model_config");
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt, DEFAULT_SYSTEM_PROMPT), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });
  actions.set("adminSetImageModelConfig", async (input) => {
    const value = await mergeAndSave(deps, "image_model_config", input, ["baseUrl", "apiPath", "apiFormat", "model", "temperature", "systemPrompt", "apiKey"], new Set(["apiKey"]));
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt, DEFAULT_SYSTEM_PROMPT), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });

  // 语音播报模式专用模型配置（独立于图片模型，提示词不同：只输出答案，不输出题目摘要和解析）
  actions.set("adminGetVoiceModelConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const value = await settings(deps).get("voice_model_config");
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });
  actions.set("adminSetVoiceModelConfig", async (input) => {
    const value = await mergeAndSave(deps, "voice_model_config", input, ["baseUrl", "apiPath", "apiFormat", "model", "temperature", "systemPrompt", "apiKey"], new Set(["apiKey"]));
    return { baseUrl: text(value.baseUrl), apiPath: text(value.apiPath, "/v1/chat/completions"), apiFormat: text(value.apiFormat, "openai"), model: text(value.model), temperature: Number(value.temperature ?? 0.2), systemPrompt: text(value.systemPrompt), apiKeyMasked: maskSecret(value.apiKey), hasApiKey: Boolean(value.apiKey), updatedAt: text(value.updatedAt) };
  });

  // 语音合成（TTS）配置：与文字模型配置对称（baseUrl/apiPath/model/apiKey/systemPrompt + enabled）
  actions.set("adminGetTtsConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const value = await settings(deps).get("tts_config");
    const apiPath = text(value.apiPath, "/api/v3/plan/tts/unidirectional");
    const resourceId = text(value.resourceId, "seed-tts-2.0");
    return {
      baseUrl: text(value.baseUrl, "https://openspeech.bytedance.com"),
      apiPath: apiPath === "/api/v3/tts/unidirectional" ? "/api/v3/plan/tts/unidirectional" : apiPath,
      model: text(value.model, "zh_female_vv_uranus_bigtts"),
      apiKeyMasked: maskSecret(value.apiKey),
      hasApiKey: Boolean(value.apiKey),
      resourceId: resourceId === "volc.service_type.10029" ? "seed-tts-2.0" : resourceId,
      enabled: value.enabled === undefined ? true : bool(value.enabled),
      systemPrompt: text(value.systemPrompt, ""),
      updatedAt: text(value.updatedAt)
    };
  });
  actions.set("adminSetTtsConfig", async (input) => {
    const value = await mergeAndSave(deps, "tts_config", input, ["baseUrl", "apiPath", "model", "apiKey", "resourceId", "enabled", "systemPrompt"], new Set(["apiKey"]));
    const apiPath = text(value.apiPath, "/api/v3/plan/tts/unidirectional");
    const resourceId = text(value.resourceId, "seed-tts-2.0");
    return {
      baseUrl: text(value.baseUrl, "https://openspeech.bytedance.com"),
      apiPath: apiPath === "/api/v3/tts/unidirectional" ? "/api/v3/plan/tts/unidirectional" : apiPath,
      model: text(value.model, "zh_female_vv_uranus_bigtts"),
      apiKeyMasked: maskSecret(value.apiKey),
      hasApiKey: Boolean(value.apiKey),
      resourceId: resourceId === "volc.service_type.10029" ? "seed-tts-2.0" : resourceId,
      enabled: value.enabled === undefined ? true : bool(value.enabled),
      systemPrompt: text(value.systemPrompt, ""),
      updatedAt: text(value.updatedAt)
    };
  });

  const publicAsrConfig = (value: RuntimeSetting) => {
    const wsUrl = text(value.wsUrl, "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async");
    const model = text(value.model, "bigmodel");
    const needsAgentPlanUrl = wsUrl === "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
      || wsUrl.includes("/api/v3/plan/tts/");
    const needsBigModelName = model === "doubao-seed-asr-2.0" || model === "seedasr";
    return {
      wsUrl: needsAgentPlanUrl
        ? "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async"
        : wsUrl,
      resourceId: text(value.resourceId, "volc.seedasr.sauc.duration"),
      model: needsBigModelName ? "bigmodel" : model,
      enabled: value.enabled === undefined ? true : bool(value.enabled),
      apiKeyMasked: maskSecret(value.apiKey),
      hasApiKey: Boolean(value.apiKey),
      updatedAt: text(value.updatedAt)
    };
  };

  actions.set("adminGetAsrConfig", async (input) => {
    await authenticateAdmin(deps, input);
    return publicAsrConfig(await settings(deps).get("asr_config"));
  });
  actions.set("adminSetAsrConfig", async (input) => {
    const value = await mergeAndSave(
      deps,
      "asr_config",
      input,
      ["wsUrl", "resourceId", "model", "apiKey", "enabled"],
      new Set(["apiKey"])
    );
    return publicAsrConfig(value);
  });

  actions.set("adminGetInterviewPromptConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const value = await settings(deps).get("interview_prompt_config");
    return { prompt: text(value.prompt, DEFAULT_INTERVIEW_PROMPT), updatedAt: text(value.updatedAt) };
  });
  actions.set("adminSetInterviewPromptConfig", async (input) => {
    const value = await mergeAndSave(deps, "interview_prompt_config", input, ["prompt"]);
    return { prompt: text(value.prompt, DEFAULT_INTERVIEW_PROMPT), updatedAt: text(value.updatedAt) };
  });

  actions.set("adminGetAnswerFormatConfig", async (input) => { await authenticateAdmin(deps, input); const value = await settings(deps).get("answer_format_config"); return { enabled: value.enabled === undefined ? true : bool(value.enabled), prompt: text(value.prompt, DEFAULT_ANSWER_FORMAT_PROMPT), contactInfo: text(value.contactInfo, DEFAULT_PURCHASE.contactInfo), updatedAt: text(value.updatedAt) }; });
  actions.set("adminSetAnswerFormatConfig", async (input) => { const value = await mergeAndSave(deps, "answer_format_config", input, ["enabled", "prompt", "contactInfo"]); return { enabled: value.enabled === undefined ? true : bool(value.enabled), prompt: text(value.prompt, DEFAULT_ANSWER_FORMAT_PROMPT), contactInfo: text(value.contactInfo, DEFAULT_PURCHASE.contactInfo), updatedAt: text(value.updatedAt) }; });

  actions.set("adminGetAndroidAnswerFallbackConfig", async (input) => { await authenticateAdmin(deps, input); const value = await settings(deps).get("android_answer_fallback_config"); return { mode: ["silent", "show_answer"].includes(text(value.mode)) ? text(value.mode) : "show_answer", updatedAt: text(value.updatedAt) }; });
  actions.set("adminSetAndroidAnswerFallbackConfig", async (input) => { const mode = text(input.mode); if (!["silent", "show_answer"].includes(mode)) throw new PublicError("请选择安卓端无法直接作答时的处理方式。", "INVALID_ANDROID_FALLBACK"); const value = await mergeAndSave(deps, "android_answer_fallback_config", { ...input, mode }, ["mode"]); return { mode: text(value.mode), updatedAt: text(value.updatedAt) }; });

  actions.set("getPurchaseConfig", async () => publicPurchase(await settings(deps).get("purchase_config")));
  actions.set("adminSetPurchaseConfig", async (input) => publicPurchase(await mergeAndSave(deps, "purchase_config", input, ["title", "description", "imageUrl", "purchaseUrl", "buttonText", "contactInfo"])));
  actions.set("getTutorialConfig", async () => publicTutorial(await settings(deps).get("tutorial_config")));
  actions.set("adminGetTutorialConfig", async (input) => { await authenticateAdmin(deps, input); return publicTutorial(await settings(deps).get("tutorial_config")); });
  actions.set("adminSetTutorialConfig", async (input) => publicTutorial(await mergeAndSave(deps, "tutorial_config", input, ["title", "videoUrl"])));

  actions.set("adminGetPaymentConfig", async (input) => { await authenticateAdmin(deps, input); return publicAdminPayment(await loadPaymentSetting(deps)); });
  actions.set("adminSetPaymentConfig", async (input) => {
    const admin = await authenticateAdmin(deps, input);
    const allowed = ["enabled", "appId", "gatewayUrl", "appPrivateKey", "alipayPublicKey", "notifyUrl", "returnUrl", "qrCodeTimeoutExpress", "orderTimeoutExpress", "wechatEnabled", "payjsMchId", "payjsKey", "payjsNativeUrl", "payjsQueryUrl", "payjsNotifyUrl", "epayEnabled", "epayApiUrl", "epayPid", "epayKey", "epayMerchantPrivateKey", "epayPlatformPublicKey", "epayNotifyUrl", "epayReturnUrl", "prices"];
    const preserveBlank = new Set(["appPrivateKey", "alipayPublicKey", "payjsKey", "epayKey", "epayMerchantPrivateKey", "epayPlatformPublicKey"]);
    const current = await loadPaymentSetting(deps);
    const value = mergeSetting(current, input, allowed, preserveBlank);
    const readiness = paymentReadiness(paymentRuntimeFromSetting(value));
    if (bool(value.enabled) && !readiness.alipay) throw new PublicError("支付宝配置不完整。", "ALIPAY_NOT_READY");
    if (bool(value.wechatEnabled) && !readiness.wechat) throw new PublicError("微信支付配置不完整。", "PAYJS_NOT_READY");
    if (bool(value.epayEnabled) && !readiness.epay) throw new PublicError("聚合支付配置不完整。", "EPAY_NOT_READY");
    await settings(deps).set("payment_config", value, admin.accountId);
    return publicAdminPayment(value);
  });

  return actions;
}

