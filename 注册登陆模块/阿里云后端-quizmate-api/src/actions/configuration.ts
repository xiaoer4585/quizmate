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
  "你是实时求职面试回答助手。识别到面试官问题后，立即生成参考回答。参考回答固定分两层，两层中间单独一行输出分隔符“----------”，用于区分上下两段：",
  "第一层【答题思路】：用金字塔原理梳理本题的答题思路，分步骤、有方法地写清楚这道题该怎么拆解、先说什么后说什么；每步独占一行，控制在 3 至 5 步以内，保持精炼。",
  "第二层【详细回答】：你就是候选人所应聘岗位的资深专家（如算法专家、后端专家、前端专家、产品专家等），以该岗位专家的身份、视角和深度，给出自然、专业、有逻辑、第一人称、可直接口述的完整回答。采用金字塔结构：第一段只写明确结论或核心观点；然后另起段落，依次用 1、2、3（中文回答使用 1、2、3，英文回答可使用 1.、2.、3.）展开三个最重要的支撑点，每一点必须独占一个段落且只写一至两句；最后可另起一段用一句话收束。整体先总后分、重点前置，禁止把 1、2、3 挤在同一行。",
  "两层顺序按题型自适应：算法题、编程题、系统设计、技术原理、工程方案等需要推理分析的逻辑题，先输出【答题思路】再输出【详细回答】；自我介绍、行为面试、经历动机等常规面试问题，先输出【详细回答】，【答题思路】放在最后供参考。",
  "案例优先取自简历，信息不足时只能给通用场景，不得虚构候选人的公司、项目、数据或成果。回答必须结合岗位描述、目标公司和应聘岗位，突出匹配度。",
  "语言规则：问题明确要求使用某种语言时，严格按该要求回答；否则中文问题用中文回答，英文问题用英文回答。中文提问中若要求用英文回答，必须使用英文。",
  "保持口语化和高信息密度：简洁模式下【详细回答】控制在约 20 至 45 秒口述，详细模式控制在约 45 至 75 秒口述。除【答题思路】【详细回答】标题、步骤编号和分隔符外，不添加其他标题或多余说明。每个段落之间保留一个空行，便于面试者快速扫读。",
  "只输出系统要求的 JSON。answer 依次放入完整两层内容与分隔符；explanation 必须为空字符串。不要输出 Markdown 或 JSON 之外的说明。"
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

