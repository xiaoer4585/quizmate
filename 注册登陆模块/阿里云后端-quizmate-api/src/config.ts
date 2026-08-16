import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8100),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default("https://quizmate.vip,https://www.quizmate.vip,https://www.cpan.quizmate.vip,https://cpan.quizmate.vip"),
  TRUST_PROXY: booleanFromString.default(false),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(6 * 1024 * 1024),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  ADMIN_SECRET: z.string().optional(),
  CONFIG_ENCRYPTION_KEY: z.string().optional(),
  WATCH_WORKER_SECRET: z.string().optional(),
  WATCH_COOKIE_MASTER_KEY: z.string().optional(),
  COMPAT_HMAC_SECRET: z.string().optional(),
  // 错题集小程序内部调用密钥（cuotiAnalyze action 认证用）
  CUOTI_INTERNAL_SECRET: z.string().optional(),
  EMAIL_CODE_SECRET: z.string().optional(),
  MODEL_BASE_URL: z.string().url().optional(),
  MODEL_API_KEY: z.string().optional(),
  MODEL_NAME: z.string().optional(),
  MODEL_API_PATH: z.string().default("/v1/chat/completions"),
  MODEL_API_FORMAT: z.enum(["openai", "anthropic"]).default("openai"),
  // 图片输入类模型配置（截图/带图题目时使用，独立于文本模型）
  IMAGE_MODEL_BASE_URL: z.string().optional(),
  IMAGE_MODEL_API_KEY: z.string().optional(),
  IMAGE_MODEL_NAME: z.string().optional(),
  IMAGE_MODEL_API_PATH: z.string().default("/v1/chat/completions"),
  IMAGE_MODEL_API_FORMAT: z.enum(["openai", "anthropic"]).default("openai"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ALIPAY_APP_ID: z.string().optional(),
  ALIPAY_ENABLED: booleanFromString.optional(),
  ALIPAY_GATEWAY_URL: z.string().url().optional(),
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_NOTIFY_URL: z.string().url().optional(),
  PAYJS_ENABLED: booleanFromString.optional(),
  PAYJS_MCHID: z.string().optional(),
  PAYJS_KEY: z.string().optional(),
  PAYJS_NATIVE_URL: z.string().url().optional(),
  PAYJS_QUERY_URL: z.string().url().optional(),
  PAYJS_NOTIFY_URL: z.string().url().optional(),
  EPAY_ENABLED: booleanFromString.optional(),
  EPAY_API_URL: z.string().url().optional(),
  EPAY_PID: z.string().optional(),
  EPAY_KEY: z.string().optional(),
  EPAY_MERCHANT_PRIVATE_KEY: z.string().optional(),
  EPAY_PLATFORM_PUBLIC_KEY: z.string().optional(),
  EPAY_NOTIFY_URL: z.string().url().optional(),
  EPAY_RETURN_URL: z.string().url().optional()
});

export type AppConfig = z.infer<typeof configSchema> & { corsOrigins: string[] };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(source);
  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return { ...parsed, corsOrigins };
}
