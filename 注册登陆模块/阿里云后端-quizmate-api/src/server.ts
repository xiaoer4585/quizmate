import { createActionRegistry } from "./actions/index.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createNotificationSender, createVerificationCodeSender } from "./services/smtp.js";
import { REGISTER_BONUS_CREDITS } from "./domain/credits.js";
import { createAnalysisModel, type ModelCallFailureRecorder, type ModelCallRecorder } from "./services/model.js";
import { createTtsService } from "./services/tts.js";
import { createPaymentDependencies } from "./payments/config.js";
import { RuntimeSettingsStore } from "./services/runtime-settings.js";
import { getModelFailureContext } from "./services/model-failure-context.js";

// 上海时区当日日期（YYYY-MM-DD），与官网访问统计保持一致
function shanghaiDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
if (!config.CONFIG_ENCRYPTION_KEY) throw new Error("CONFIG_ENCRYPTION_KEY is required");
if (!config.ADMIN_SECRET) throw new Error("ADMIN_SECRET is required");
if (!config.WATCH_WORKER_SECRET) throw new Error("WATCH_WORKER_SECRET is required");
if (!config.WATCH_COOKIE_MASTER_KEY) throw new Error("WATCH_COOKIE_MASTER_KEY is required");
const settings = new RuntimeSettingsStore(pool, config.CONFIG_ENCRYPTION_KEY);
const emailSetting = await settings.get("email_config");
const emailCodeSecret = String(emailSetting.emailCodeSecret ?? config.EMAIL_CODE_SECRET ?? "");
if (!emailCodeSecret) throw new Error("EMAIL_CODE_SECRET is required");

// 成功调用模型后按天统计文本/图片模型调用次数（后台曲线图使用）
const recordModelCall: ModelCallRecorder = (info) => {
  const day = shanghaiDate();
  pool.query(
    `INSERT INTO model_daily_calls(call_date, model_type, count, last_model_name, last_called_at, created_at)
     VALUES ($1, $2, 1, $3, now(), now())
     ON CONFLICT(call_date, model_type) DO UPDATE
       SET count = model_daily_calls.count + 1,
           last_model_name = EXCLUDED.last_model_name,
           last_called_at = now()`,
    [day, info.modelType, info.modelName]
  ).catch(() => undefined);
};

// 模型调用失败明细（后台"AI 失败"页面使用，按错误码/类型/时间筛选）
const recordModelCallFailure: ModelCallFailureRecorder = (info) => {
  pool.query(
    `INSERT INTO model_call_failures(
       model_type, model_name, error_code, error_message,
       http_status, request_mode, account_id, account_email, request_id, client_ip, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [
      info.modelType,
      info.modelName,
      info.errorCode,
      info.errorMessage,
      info.httpStatus ?? null,
      info.requestMode ?? null,
      info.accountId ?? null,
      info.accountEmail ?? null,
      info.requestId ?? null,
      info.clientIp ?? null
    ]
  ).catch(() => undefined);
};

const app = await buildApp(config, {
  db: pool,
  actions: createActionRegistry({
    db: pool,
    config,
    emailCodeSecret,
    registerBonusCredits: REGISTER_BONUS_CREDITS,
    sessionTtlDays: 30,
    sendVerificationCode: createVerificationCodeSender(config, () => settings.get("email_config")),
    sendNotification: createNotificationSender(config, () => settings.get("email_config")),
    runAnalysisModel: createAnalysisModel(
      config,
      () => settings.get("model_config"),
      () => settings.get("image_model_config"),
      () => settings.get("voice_model_config"),
      recordModelCall,
      recordModelCallFailure,
      getModelFailureContext
    ),
    runTtsSynth: createTtsService(config, () => settings.get("tts_config")),
    payment: createPaymentDependencies(config),
    settings,
    adminSecret: config.ADMIN_SECRET
  }),
  version: "0.1.0",
  watch: {
    db: pool,
    workerSecret: config.WATCH_WORKER_SECRET,
    cookieMasterKey: config.WATCH_COOKIE_MASTER_KEY
  }
});

const close = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGTERM", () => void close("SIGTERM"));
process.on("SIGINT", () => void close("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
