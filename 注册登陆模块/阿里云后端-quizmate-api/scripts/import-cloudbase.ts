import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createPool } from "../src/db.js";
import { RuntimeSettingsStore } from "../src/services/runtime-settings.js";

type Doc = Record<string, unknown>;
type Dump = { format: string; collections: Record<string, Doc[]> };

function string(value: unknown): string { return String(value ?? ""); }
function nullable(value: unknown): string | null { const text = string(value).trim(); return text || null; }
function date(value: unknown): Date | null { const parsed = new Date(string(value)); return Number.isFinite(parsed.getTime()) ? parsed : null; }
function uuid(value: unknown): string { const text = string(value); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : crypto.randomUUID(); }
function digest(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: tsx scripts/import-cloudbase.ts <export.json>");
const dump = JSON.parse(await readFile(inputPath, "utf8")) as Dump;
if (dump.format !== "quizmate-cloudbase-export-v1" || !dump.collections) throw new Error("invalid migration dump");

const config = loadConfig();
if (!config.CONFIG_ENCRYPTION_KEY) throw new Error("CONFIG_ENCRYPTION_KEY is required");
const pool = createPool(config.DATABASE_URL);
const settings = new RuntimeSettingsStore(pool, config.CONFIG_ENCRYPTION_KEY);
const c = dump.collections;

async function map(collection: string, legacyId: unknown, table: string, targetId: string, source: unknown) {
  await pool.query(
    `INSERT INTO migration_map(collection_name, legacy_id, target_table, target_id, source_digest)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT(collection_name,legacy_id) DO UPDATE
       SET target_table=EXCLUDED.target_table,target_id=EXCLUDED.target_id,source_digest=EXCLUDED.source_digest,migrated_at=now()`,
    [collection, string(legacyId), table, targetId, digest(source)]
  );
}

try {
  for (const item of c.study_users ?? []) {
    await pool.query(
      `INSERT INTO legacy_admin_users(legacy_id,username,password_hash,status,created_at,updated_at,migrated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,now()),COALESCE($6,now()),now())
       ON CONFLICT(legacy_id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,migrated_at=now()`,
      [string(item._id), string(item.username), string(item.passwordHash), string(item.status || "active"), date(item.createdAt), date(item.updatedAt)]
    );
    await map("study_users", item._id, "legacy_admin_users", string(item._id), item);
  }

  const accountIds = new Map<string, string>();
  for (const item of c.study_credit_accounts ?? []) {
    const accountId = uuid(item.accountId);
    accountIds.set(string(item.accountId), accountId);
    await pool.query(
      `INSERT INTO accounts(account_id,legacy_id,email,password_salt,password_hash,status,register_bonus_credits,created_at,updated_at,last_login_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now()),COALESCE($9,now()),$10,now())
       ON CONFLICT(account_id) DO UPDATE SET email=EXCLUDED.email,password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash,status=EXCLUDED.status,register_bonus_credits=EXCLUDED.register_bonus_credits,updated_at=EXCLUDED.updated_at,last_login_at=EXCLUDED.last_login_at,migrated_at=now()`,
      [accountId, string(item._id), string(item.email).trim().toLowerCase(), string(item.passwordSalt), string(item.passwordHash), string(item.status || "active"), Number(item.registerBonusCredits || 0), date(item.createdAt), date(item.updatedAt), date(item.lastLoginAt)]
    );
    await pool.query(
      `INSERT INTO credit_accounts(account_id,credits,total_charged_credits,total_consumed_credits,updated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,now())) ON CONFLICT(account_id) DO UPDATE SET
         credits=EXCLUDED.credits,total_charged_credits=EXCLUDED.total_charged_credits,total_consumed_credits=EXCLUDED.total_consumed_credits,updated_at=EXCLUDED.updated_at`,
      [accountId, Number(item.credits || 0), Number(item.totalChargedCredits || 0), Number(item.totalConsumedCredits || 0), date(item.updatedAt)]
    );
    const hashes = [...new Set([item.tokenHash, ...(Array.isArray(item.tokenHashes) ? item.tokenHashes : [])].map(string).filter((value) => /^[a-f0-9]{64}$/i.test(value)))];
    for (const tokenHash of hashes) {
      await pool.query(
        `INSERT INTO account_sessions(account_id,token_hash,created_at,last_seen_at,migrated_at)
         VALUES ($1,$2,COALESCE($3,now()),COALESCE($4,now()),now()) ON CONFLICT(token_hash) DO NOTHING`,
        [accountId, tokenHash, date(item.createdAt), date(item.lastLoginAt ?? item.updatedAt)]
      );
    }
    await map("study_credit_accounts", item._id, "accounts", accountId, item);
  }

  for (const item of c.study_email_codes ?? []) {
    const codeId = uuid(item.codeId);
    await pool.query(
      `INSERT INTO email_codes(code_id,legacy_id,email,purpose,code_hash,status,attempts,created_at,expires_at,used_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now()),COALESCE($9,now()),$10,now()) ON CONFLICT(code_id) DO NOTHING`,
      [codeId, string(item._id), string(item.email).toLowerCase(), string(item.purpose), string(item.codeHash), string(item.status || "expired"), Number(item.attempts || 0), date(item.createdAt), date(item.expiresAt), date(item.usedAt)]
    );
    await map("study_email_codes", item._id, "email_codes", codeId, item);
  }

  for (const item of c.study_credit_logs ?? []) {
    const accountId = accountIds.get(string(item.accountId));
    if (!accountId) continue;
    const logId = uuid(item.logId);
    let credits = Number(item.credits || 0);
    if (string(item.type) === "consume" && credits > 0) credits = -credits;
    if (!credits) continue;
    await pool.query(
      `INSERT INTO credit_ledger(log_id,legacy_id,account_id,operation_type,credits,balance_after,source,request_id,order_no,package_id,device_id,reason,created_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,now()),now()) ON CONFLICT(log_id) DO NOTHING`,
      [logId, string(item._id), accountId, string(item.type || "legacy"), credits, Number(item.balanceAfter || 0), nullable(item.source), nullable(item.requestId), nullable(item.orderNo), nullable(item.packageId), nullable(item.deviceId), nullable(item.reason), date(item.createdAt)]
    );
    await map("study_credit_logs", item._id, "credit_ledger", logId, item);
  }

  for (const item of c.study_licenses ?? []) {
    const licenseId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO legacy_licenses(license_id,legacy_id,code,status,days,device_id,activated_at,expires_at,created_at,updated_at,source,note,owner_user_id,username,reset_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()),COALESCE($10,now()),$11,$12,$13,$14,$15,now())
       ON CONFLICT(code) DO UPDATE SET status=EXCLUDED.status,days=EXCLUDED.days,device_id=EXCLUDED.device_id,activated_at=EXCLUDED.activated_at,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at,source=EXCLUDED.source,note=EXCLUDED.note,reset_at=EXCLUDED.reset_at,migrated_at=now()`,
      [licenseId, string(item._id), string(item.code).toUpperCase(), string(item.status || "unused"), Number(item.days || 0), nullable(item.deviceId), date(item.activatedAt), date(item.expiresAt), date(item.createdAt), date(item.updatedAt), nullable(item.source), nullable(item.note), nullable(item.ownerUserId), nullable(item.username), date(item.resetAt)]
    );
    const actual = await pool.query<{ license_id: string }>("SELECT license_id FROM legacy_licenses WHERE code=$1", [string(item.code).toUpperCase()]);
    await map("study_licenses", item._id, "legacy_licenses", actual.rows[0]?.license_id ?? licenseId, item);
  }

  for (const item of c.study_devices ?? []) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO devices(device_record_id,legacy_id,device_id,legacy_license_code,first_seen_at,last_seen_at,migrated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,now()),COALESCE($6,now()),now()) ON CONFLICT DO NOTHING`,
      [id, string(item._id), string(item.deviceId), nullable(item.licenseCode), date(item.createdAt), date(item.lastSeenAt ?? item.updatedAt)]
    );
    await map("study_devices", item._id, "devices", id, item);
  }

  const docIds = new Map<string, string>();
  for (const item of c.study_knowledge_docs ?? []) {
    const docId = uuid(item.docId);
    docIds.set(string(item.docId), docId);
    const accountId = accountIds.get(string(item.accountId));
    const ownerType = accountId ? "account" : "legacy_license";
    await pool.query(
      `INSERT INTO knowledge_docs(doc_id,legacy_id,owner_type,account_id,legacy_license_code,legacy_device_id,file_name,mime_type,size_bytes,text_length,chunk_count,keywords,text_preview,created_at,updated_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,now()),COALESCE($15,now()),now()) ON CONFLICT(doc_id) DO NOTHING`,
      [docId, string(item._id), ownerType, accountId ?? null, accountId ? null : nullable(item.licenseCode), accountId ? null : nullable(item.deviceId), string(item.fileName), nullable(item.mimeType), Number(item.size || 0), Number(item.textLength || 0), Number(item.chunkCount || 0), JSON.stringify(Array.isArray(item.keywords) ? item.keywords : []), nullable(item.textPreview), date(item.createdAt), date(item.updatedAt)]
    );
    await map("study_knowledge_docs", item._id, "knowledge_docs", docId, item);
  }
  for (const item of c.study_knowledge_chunks ?? []) {
    const docId = docIds.get(string(item.docId)); if (!docId) continue;
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO knowledge_chunks(chunk_id,legacy_id,doc_id,chunk_index,content,keywords,created_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,now()),now()) ON CONFLICT(doc_id,chunk_index) DO NOTHING`,
      [id, string(item._id), docId, Number(item.index || 0), string(item.text), JSON.stringify(Array.isArray(item.keywords) ? item.keywords : []), date(item.createdAt)]
    );
    await map("study_knowledge_chunks", item._id, "knowledge_chunks", id, item);
  }

  for (const item of c.study_orders ?? []) {
    const orderId = crypto.randomUUID();
    const outTradeNo = string(item.outTradeNo || item.orderNo || item._id);
    const accountId = accountIds.get(string(item.accountId)) ?? null;
    const provider = string(item.provider || "alipay");
    const providerTradeNo = nullable(item.epayTradeNo ?? item.alipayTradeNo ?? item.payjsOrderId);
    await pool.query(
      `INSERT INTO orders(order_id,legacy_id,out_trade_no,provider,order_type,payment_type,account_id,email,status,amount,subject,package_id,package_name,base_credits,bonus_credits,total_credits,days,device_id,fulfillment_mode,legacy_license_code,provider_trade_no,provider_status,paid_at,expires_at,created_at,updated_at,qr_code,pay_url,qr_data_url,buyer,error_message,credited_at,credit_balance_after,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,COALESCE($25,now()),COALESCE($26,now()),$27,$28,$29,$30,$31,$32,$33,now())
       ON CONFLICT(out_trade_no) DO UPDATE SET status=EXCLUDED.status,provider_status=EXCLUDED.provider_status,paid_at=EXCLUDED.paid_at,updated_at=EXCLUDED.updated_at,credited_at=EXCLUDED.credited_at,credit_balance_after=EXCLUDED.credit_balance_after,migrated_at=now()`,
      [orderId, string(item._id), outTradeNo, provider, string(item.orderType || "license"), nullable(item.paymentType), accountId, nullable(item.email), string(item.status || "created"), Number(item.amount || 0), nullable(item.subject), nullable(item.packageId), nullable(item.packageName), Number(item.baseCredits || 0) || null, Number(item.bonusCredits || 0) || null, Number(item.totalCredits || 0) || null, Number(item.days || 0) || null, nullable(item.deviceId), nullable(item.fulfillmentMode), nullable(item.licenseCode), providerTradeNo, nullable(item.tradeStatus), date(item.paidAt), date(item.expiresAt), date(item.createdAt), date(item.updatedAt), nullable(item.qrCode), nullable(item.payUrl), nullable(item.qrDataUrl), nullable(item.buyer), nullable(item.error), date(item.creditedAt), Number(item.creditBalanceAfter || 0) || null]
    );
    await map("study_orders", item._id, "orders", orderId, item);
  }

  for (const item of c.study_usage_logs ?? []) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO usage_logs(usage_id,legacy_id,account_id,legacy_license_code,device_id,source,status,credit_cost,used_knowledge,knowledge_hit_count,created_at,migrated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8,$9,COALESCE($10,now()),now()) ON CONFLICT(legacy_id) DO NOTHING`,
      [id, string(item._id), accountIds.get(string(item.accountId)) ?? null, nullable(item.licenseCode), nullable(item.deviceId), nullable(item.source), Number(item.creditCost || 0), Boolean(item.usedKnowledge), Number(item.knowledgeHitCount || 0), date(item.createdAt)]
    );
    await map("study_usage_logs", item._id, "usage_logs", id, item);
  }

  for (const item of c.study_website_daily_visits ?? []) {
    const key = string(item.date || item._id).slice(0, 10);
    await pool.query(
      `INSERT INTO website_daily_visits(visit_date,count,last_path,last_visited_at,created_at,migrated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,now()),now()) ON CONFLICT(visit_date) DO UPDATE SET count=EXCLUDED.count,last_path=EXCLUDED.last_path,last_visited_at=EXCLUDED.last_visited_at,migrated_at=now()`,
      [key, Number(item.count || 0), nullable(item.lastPath), date(item.lastVisitedAt), date(item.createdAt)]
    );
    await map("study_website_daily_visits", item._id, "website_daily_visits", key, item);
  }

  for (const item of c.study_settings ?? []) {
    const key = string(item._id);
    const value = { ...item }; delete value._id;
    if (key === "payment_config") {
      value.epayNotifyUrl = "https://api.quizmate.vip/study-auth-api?action=epayNotify";
      value.notifyUrl = "https://api.quizmate.vip/study-auth-api?action=alipayNotify";
      value.payjsNotifyUrl = value.payjsNotifyUrl ? "https://api.quizmate.vip/study-auth-api?action=payjsNotify" : "";
      value.epayReturnUrl = "https://www.quizmate.vip/recharge.html";
      value.returnUrl = "https://www.quizmate.vip/purchase.html";
    }
    if (key === "purchase_config" && string(value.imageUrl).includes("tcloudbase")) value.imageUrl = "https://www.quizmate.vip/assets/wechat-contact.jpg";
    await settings.set(key, value, "cloudbase-migration");
    await map("study_settings", item._id, "settings", key, item);
  }

  const report = await pool.query<Record<string, string>>(`SELECT
    (SELECT count(*)::text FROM accounts) accounts,
    (SELECT count(*)::text FROM account_sessions) sessions,
    (SELECT count(*)::text FROM credit_ledger) credit_logs,
    (SELECT count(*)::text FROM legacy_licenses) licenses,
    (SELECT count(*)::text FROM orders) orders,
    (SELECT count(*)::text FROM knowledge_docs) knowledge_docs,
    (SELECT count(*)::text FROM knowledge_chunks) knowledge_chunks,
    (SELECT count(*)::text FROM usage_logs) usage_logs,
    (SELECT count(*)::text FROM website_daily_visits) website_days`);
  process.stdout.write(JSON.stringify(report.rows[0]));
} finally {
  await pool.end();
}

