import crypto from "node:crypto";
import type { Database } from "../db.js";

export type RuntimeSetting = Record<string, unknown>;

const SECRET_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  model_config: new Set(["apiKey"]),
  image_model_config: new Set(["apiKey"]),
  resume_text_model_config: new Set(["apiKey"]),
  resume_image_model_config: new Set(["apiKey"]),
  voice_model_config: new Set(["apiKey"]),
  tts_config: new Set(["apiKey"]),
  payment_config: new Set(["appPrivateKey", "alipayPublicKey", "payjsKey", "epayKey", "epayMerchantPrivateKey", "epayPlatformPublicKey"]),
  email_config: new Set(["emailCodeSecret", "smtpPass"])
};

function encryptionKey(value: string): Buffer {
  const text = value.trim();
  const decoded = /^[A-Fa-f0-9]{64}$/.test(text)
    ? Buffer.from(text, "hex")
    : Buffer.from(text, "base64");
  if (decoded.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return decoded;
}

function encryptJson(key: Buffer, value: RuntimeSetting): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptJson(key: Buffer, value: string): RuntimeSetting {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("invalid encrypted setting");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid decrypted setting");
  return parsed as RuntimeSetting;
}

// 内存缓存：避免每次请求都查数据库，5分钟过期
const CACHE_TTL_MS = 5 * 60 * 1000;

export class RuntimeSettingsStore {
  private readonly key: Buffer;
  private readonly cache = new Map<string, { value: RuntimeSetting; expiresAt: number }>();

  constructor(private readonly db: Database, encryptionKeyValue: string) {
    this.key = encryptionKey(encryptionKeyValue);
  }

  async get(settingKey: string): Promise<RuntimeSetting> {
    const cached = this.cache.get(settingKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [plainResult, secretResult] = await Promise.all([
      this.db.query<{ value: RuntimeSetting }>("SELECT value FROM settings WHERE setting_key = $1", [settingKey]),
      this.db.query<{ encrypted_value: string }>("SELECT encrypted_value FROM secret_settings WHERE setting_key = $1", [settingKey])
    ]);
    const plain = plainResult.rows[0]?.value ?? {};
    const encrypted = secretResult.rows[0]?.encrypted_value;
    const secret = encrypted ? decryptJson(this.key, encrypted) : {};
    const merged = { ...plain, ...secret };
    this.cache.set(settingKey, { value: merged, expiresAt: Date.now() + CACHE_TTL_MS });
    return merged;
  }

  async set(settingKey: string, value: RuntimeSetting, actor = "admin"): Promise<void> {
    const secretNames = SECRET_FIELDS[settingKey] ?? new Set<string>();
    this.cache.delete(settingKey); // 配置更新后清除缓存
    const plain: RuntimeSetting = {};
    const secret: RuntimeSetting = {};
    for (const [name, item] of Object.entries(value)) {
      if (secretNames.has(name)) secret[name] = item;
      else plain[name] = item;
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO settings(setting_key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT(setting_key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [settingKey, JSON.stringify(plain), actor]
      );
      if (Object.keys(secret).length) {
        await client.query(
          `INSERT INTO secret_settings(setting_key, encrypted_value, updated_at, updated_by)
           VALUES ($1, $2, now(), $3)
           ON CONFLICT(setting_key) DO UPDATE
             SET encrypted_value = EXCLUDED.encrypted_value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [settingKey, encryptJson(this.key, secret), actor]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

