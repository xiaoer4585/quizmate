import crypto from "node:crypto";
import type { PoolClient } from "pg";
import type { Database } from "../db.js";
import { REFERRAL_COMMISSION_RATE } from "../domain/credits.js";
import type { PaymentRuntimeConfig } from "./config.js";
import {
  paymentPayloadDigest,
  verifyAlipayParams,
  verifyEpayParams,
  verifyPayjsParams,
  type PaymentParams
} from "./signatures.js";
import { verifyNimanParams } from "./niman-rsa.js";

export type PaymentProvider = "alipay" | "payjs" | "epay";

interface OrderRow {
  out_trade_no: string;
  provider: string;
  order_type: string;
  account_id: string | null;
  status: string;
  amount: string;
  total_credits: string | number | null;
  package_id: string | null;
  days: number | null;
  device_id: string | null;
  fulfillment_mode: string | null;
  legacy_license_code: string | null;
}

export interface SettlementResult extends Record<string, unknown> {
  accepted: boolean;
  duplicate: boolean;
  settled: boolean;
  reason: string;
}

function verifySignature(provider: PaymentProvider, params: PaymentParams, config: PaymentRuntimeConfig): boolean {
  if (provider === "alipay") return verifyAlipayParams(params, config.alipay.publicKey);
  if (provider === "payjs") return verifyPayjsParams(params, config.payjs.key);
  // V2: RSA 验签（使用平台公钥），兼容 V1 MD5 验签
  if (config.epay.platformPublicKey) return verifyNimanParams(params, config.epay.platformPublicKey);
  return verifyEpayParams(params, config.epay.key);
}

function callbackOrderNo(params: PaymentParams): string {
  return String(params.out_trade_no ?? "").trim();
}

function callbackEventId(provider: PaymentProvider, params: PaymentParams, digest: string): string {
  const providerId = provider === "payjs" ? params.payjs_order_id ?? params.transaction_id : params.trade_no;
  return `${String(providerId ?? callbackOrderNo(params))}:${digest}`.slice(0, 256);
}

function callbackSucceeded(provider: PaymentProvider, params: PaymentParams): boolean {
  if (provider === "payjs") return String(params.return_code ?? "") === "1";
  // V2: status=1 表示已支付
  if (provider === "epay" && String(params.status ?? "") === "1") return true;
  const status = String(params.trade_status ?? "").toUpperCase();
  return status === "TRADE_SUCCESS" || (provider === "alipay" && status === "TRADE_FINISHED");
}

function callbackStatus(provider: PaymentProvider, params: PaymentParams): string {
  return String(provider === "payjs" ? params.return_code ?? "" : params.trade_status ?? "").slice(0, 80);
}

function decimalToCents(value: unknown): number | null {
  const text = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const decimals = (match[2] ?? "").padEnd(2, "0");
  if (!Number.isSafeInteger(whole)) return null;
  const cents = whole * 100 + Number(decimals);
  return Number.isSafeInteger(cents) ? cents : null;
}

function callbackAmountCents(provider: PaymentProvider, params: PaymentParams): number | null {
  if (provider === "payjs") {
    const value = String(params.total_fee ?? "").trim();
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  }
  return decimalToCents(params.total_amount ?? params.money);
}

function callbackAccountId(provider: PaymentProvider, params: PaymentParams): string {
  if (provider === "epay") return String(params.param ?? "").trim();
  if (provider === "alipay") return String(params.passback_params ?? "").trim();
  try {
    const attach = JSON.parse(String(params.attach ?? "{}")) as { accountId?: unknown };
    return String(attach.accountId ?? "").trim();
  } catch {
    return "";
  }
}

async function finishEvent(client: PoolClient, provider: PaymentProvider, eventId: string, status: string): Promise<void> {
  await client.query(
    "UPDATE payment_events SET status = $3, processed_at = now() WHERE provider = $1 AND event_id = $2",
    [provider, eventId, status]
  );
}

function providerMatches(provider: PaymentProvider, orderProvider: string): boolean {
  return provider === orderProvider || (provider === "payjs" && orderProvider === "wechat");
}

export async function settlePaymentCallback(
  db: Database,
  config: PaymentRuntimeConfig,
  provider: PaymentProvider,
  params: PaymentParams
): Promise<SettlementResult> {
  if (!verifySignature(provider, params, config)) {
    return { accepted: false, duplicate: false, settled: false, reason: "invalid_signature" };
  }
  const outTradeNo = callbackOrderNo(params);
  if (!outTradeNo) return { accepted: false, duplicate: false, settled: false, reason: "missing_order_no" };

  const digest = paymentPayloadDigest(params);
  const eventId = callbackEventId(provider, params, digest);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<OrderRow>(
      `SELECT out_trade_no, provider, order_type, account_id, status, amount, total_credits, package_id,
              days, device_id, fulfillment_mode, legacy_license_code
         FROM orders WHERE out_trade_no = $1 FOR UPDATE`,
      [outTradeNo]
    );
    const order = orderResult.rows[0];
    if (!order || !providerMatches(provider, order.provider)) {
      await client.query("ROLLBACK");
      return { accepted: false, duplicate: false, settled: false, reason: "order_not_found_or_provider_mismatch" };
    }

    const inserted = await client.query(
      `INSERT INTO payment_events(provider, event_id, out_trade_no, signature_valid, payload_digest, status)
       VALUES ($1, $2, $3, true, $4, 'received') ON CONFLICT(provider, event_id) DO NOTHING`,
      [provider, eventId, outTradeNo, digest]
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { accepted: true, duplicate: true, settled: false, reason: "duplicate_event" };
    }

    if (!callbackSucceeded(provider, params)) {
      await client.query(
        "UPDATE orders SET provider_status = $2, notify_at = now(), updated_at = now() WHERE out_trade_no = $1",
        [outTradeNo, callbackStatus(provider, params)]
      );
      await finishEvent(client, provider, eventId, "ignored_non_success");
      await client.query("COMMIT");
      return { accepted: true, duplicate: false, settled: false, reason: "non_success_status" };
    }

    const paidCents = callbackAmountCents(provider, params);
    const orderCents = decimalToCents(order.amount);
    const accountReference = callbackAccountId(provider, params);
    if (paidCents === null || orderCents === null || paidCents !== orderCents) {
      await finishEvent(client, provider, eventId, "rejected_amount_mismatch");
      await client.query("COMMIT");
      return { accepted: false, duplicate: false, settled: false, reason: "amount_mismatch" };
    }
    // shop_credits 订单不需要关联账户（购买者可能未注册），跳过 account 匹配检查
    if (order.order_type !== "shop_credits" && accountReference && accountReference !== order.account_id) {
      await finishEvent(client, provider, eventId, "rejected_account_mismatch");
      await client.query("COMMIT");
      return { accepted: false, duplicate: false, settled: false, reason: "account_mismatch" };
    }
    if (order.status === "paid") {
      await finishEvent(client, provider, eventId, "already_paid");
      await client.query("COMMIT");
      return { accepted: true, duplicate: false, settled: false, reason: "already_paid" };
    }

    const tradeNo = String(provider === "payjs" ? params.transaction_id ?? params.payjs_order_id ?? "" : params.trade_no ?? "");
    if (order.order_type === "license") {
      const days = Number(order.days ?? 0);
      if (![30, 90, 365].includes(days)) {
        await finishEvent(client, provider, eventId, "rejected_invalid_license_plan");
        await client.query("COMMIT");
        return { accepted: false, duplicate: false, settled: false, reason: "invalid_license_plan" };
      }
      const code = order.legacy_license_code || crypto.randomBytes(12).toString("hex").slice(0, 16).toUpperCase();
      const bind = order.fulfillment_mode !== "issue_code" && Boolean(order.device_id);
      const activatedAt = bind ? new Date() : null;
      const expiresAt = activatedAt ? new Date(activatedAt.getTime() + days * 86_400_000) : null;
      await client.query(
        `INSERT INTO legacy_licenses(code, status, days, device_id, activated_at, expires_at, source, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'payment',now(),now()) ON CONFLICT(code) DO NOTHING`,
        [code, bind ? "active" : "unused", days, bind ? order.device_id : null, activatedAt, expiresAt]
      );
      if (bind) {
        await client.query(
          `INSERT INTO devices(device_id, legacy_license_code, first_seen_at, last_seen_at)
           VALUES ($1,$2,now(),now())`,
          [order.device_id, code]
        );
      }
      await client.query(
        `UPDATE orders SET status='paid', legacy_license_code=$2, provider_trade_no=$3,
          provider_status=$4, paid_at=COALESCE(paid_at,now()), notify_at=now(), updated_at=now()
         WHERE out_trade_no=$1`,
        [outTradeNo, code, tradeNo, callbackStatus(provider, params)]
      );
      await finishEvent(client, provider, eventId, "settled");
      await client.query("COMMIT");
      return { accepted: true, duplicate: false, settled: true, reason: "settled" };
    }

    // shop_credits 订单：支付成功后生成兑换码，不直接加积分
    if (order.order_type === "shop_credits") {
      const { fulfillShopOrder } = await import("../actions/redemption-codes.js");
      const fulfillment = await fulfillShopOrder(client, outTradeNo);
      if (!fulfillment) {
        await finishEvent(client, provider, eventId, "rejected_shop_order_not_found");
        await client.query("COMMIT");
        return { accepted: false, duplicate: false, settled: false, reason: "shop_order_not_found" };
      }
      await client.query(
        `UPDATE orders SET status='paid', provider_trade_no=$2, provider_status=$3,
            paid_at = COALESCE(paid_at, now()), notify_at = now(), updated_at = now()
          WHERE out_trade_no=$1`,
        [outTradeNo, tradeNo, callbackStatus(provider, params)]
      );
      await finishEvent(client, provider, eventId, "settled");
      await client.query("COMMIT");
      return { accepted: true, duplicate: false, settled: true, reason: "settled", fulfillment };
    }

    if (order.order_type !== "credits" || !order.account_id || Number(order.total_credits ?? 0) <= 0) {
      await finishEvent(client, provider, eventId, "rejected_unsupported_order");
      await client.query("COMMIT");
      return { accepted: false, duplicate: false, settled: false, reason: "unsupported_order" };
    }

    const creditResult = await client.query<{ credits: string | number }>(
      `UPDATE credit_accounts
          SET credits = credits + $2,
              total_charged_credits = total_charged_credits + $2,
              updated_at = now()
        WHERE account_id = $1
        RETURNING credits`,
      [order.account_id, order.total_credits]
    );
    const balance = creditResult.rows[0]?.credits;
    if (balance === undefined) throw new Error("credit account missing");

    await client.query(
      `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, order_no, package_id, reason)
       VALUES ($1, 'recharge', $2, $3, $4, $5, $6, 'payment_callback')`,
      [order.account_id, order.total_credits, balance, provider, outTradeNo, order.package_id]
    );
    await client.query(
      `UPDATE orders
          SET status = 'paid', provider_trade_no = $2, provider_status = $3,
              paid_at = COALESCE(paid_at, now()), credited_at = COALESCE(credited_at, now()),
              credit_balance_after = $4, notify_at = now(), updated_at = now()
        WHERE out_trade_no = $1`,
      [outTradeNo, tradeNo, callbackStatus(provider, params), balance]
    );

    // 邀请充值提成：检查充值用户是否有邀请人
    await createReferralCommission(client, order.account_id, outTradeNo, order.amount, order.package_id ?? "");

    await finishEvent(client, provider, eventId, "settled");
    await client.query("COMMIT");
    return { accepted: true, duplicate: false, settled: true, reason: "settled" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// 邀请充值提成：被邀请人充值成功后，为邀请人创建待结算提成记录
async function createReferralCommission(
  client: PoolClient,
  inviteeAccountId: string | null,
  orderNo: string,
  rechargeAmount: string,
  _packageId: string
): Promise<void> {
  if (!inviteeAccountId) return;

  // 查找被邀请人的 referred_by（邀请人）
  const referredResult = await client.query<{ referred_by: string }>(
    "SELECT referred_by FROM accounts WHERE account_id = $1 AND referred_by IS NOT NULL",
    [inviteeAccountId]
  );
  const inviterId = referredResult.rows[0]?.referred_by;
  if (!inviterId) return;

  // 查找邀请关系（必须已奖励状态，即通过了首次使用验证）
  const referralResult = await client.query<{ referral_id: string }>(
    `SELECT referral_id FROM referrals
      WHERE inviter_account_id = $1 AND invitee_account_id = $2
        AND status = 'rewarded'`,
    [inviterId, inviteeAccountId]
  );
  const referralId = referralResult.rows[0]?.referral_id;
  if (!referralId) return;

  // 检查是否已存在该订单的提成记录（防重复）
  const existing = await client.query(
    "SELECT commission_id FROM referral_commissions WHERE order_no = $1",
    [orderNo]
  );
  if (existing.rowCount) return;

  const amount = Number(rechargeAmount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const commissionAmount = Math.round(amount * REFERRAL_COMMISSION_RATE * 100) / 100;

  await client.query(
    `INSERT INTO referral_commissions(referral_id, inviter_account_id, invitee_account_id, order_no,
       recharge_amount, commission_rate, commission_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [referralId, inviterId, inviteeAccountId, orderNo, amount.toFixed(2), REFERRAL_COMMISSION_RATE, commissionAmount.toFixed(2)]
  );
}
