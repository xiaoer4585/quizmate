import crypto from "node:crypto";
import QRCode from "qrcode";
import { CREDIT_PACKAGES, OLD_USER_RECHARGE_BONUS } from "../domain/credits.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";
import { paymentReadiness, type PaymentRuntimeConfig } from "../payments/config.js";
import { settlePaymentCallback, type PaymentProvider } from "../payments/settlement.js";
import { signAlipayParams, signEpayParams, signPayjsParams, type PaymentParams } from "../payments/signatures.js";
import { buildNimanRequest, verifyNimanParams, type NimanParams } from "../payments/niman-rsa.js";
import { loadPaymentSetting, paymentRuntimeFromSetting, publicPaymentSetting } from "./configuration.js";

interface AccountRow {
  account_id: string;
  email: string;
  status: string;
  credits: string | number;
  total_charged_credits: string | number;
}

interface CreditOrderRow {
  out_trade_no: string;
  status: string;
  provider: string;
  payment_type: string | null;
  package_id: string;
  package_name: string;
  amount: string;
  base_credits: string | number;
  bonus_credits: string | number;
  total_credits: string | number;
  subject: string;
  provider_trade_no: string | null;
  provider_status: string | null;
  expires_at: Date | string | null;
  paid_at: Date | string | null;
  created_at: Date | string | null;
}

export function paymentDeps(deps: ActionDependencies) {
  if (!deps.payment) throw new PublicError("支付服务尚未配置。", "PAYMENT_NOT_CONFIGURED", 503);
  return deps.payment;
}

export async function runtimePaymentConfig(deps: ActionDependencies): Promise<PaymentRuntimeConfig> {
  if (deps.settings) return paymentRuntimeFromSetting(await loadPaymentSetting(deps));
  return paymentDeps(deps).config;
}

export async function authenticate(deps: ActionDependencies, input: ActionInput): Promise<AccountRow> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录积分账户。", "AUTH_REQUIRED", 401);
  const result = await deps.db.query<AccountRow>(
    `SELECT a.account_id, a.email, a.status, c.credits, c.total_charged_credits
       FROM account_sessions s
       JOIN accounts a USING(account_id)
       JOIN credit_accounts c USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status !== "active") throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
  return account;
}

function creditPackage(input: ActionInput) {
  const id = String(input.packageId ?? input.planId ?? "").trim();
  const found = CREDIT_PACKAGES.find((item) => item.id === id);
  if (!found) throw new PublicError("积分套餐不存在。", "PACKAGE_NOT_FOUND", 404);
  return found;
}

export function buildEpayUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 判断是否为可重试的网络错误（ECONNRESET / SSL 握手失败 / 超时 / 中止等）
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // AbortError（由 AbortController 触发的超时中止）需要重试
  if (error.name === "AbortError") return true;
  const msg = error.message.toLowerCase();
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("ssl")) return true;
  if (msg.includes("timeout") || msg.includes("timed out")) return true;
  if (msg.includes("aborted")) return true;
  if (msg.includes("socket hang up")) return true;
  return false;
}

// 调用 niman.cn V2 API (api/pay/create)：RSA 签名，响应验签
// 对网络错误快速重试，对"有响应但无 qrcode"也重试以争取拿到二维码
export async function callNimanCreate(
  payment: { fetch: typeof globalThis.fetch },
  endpoint: string,
  orderParams: NimanParams,
  epay: { pid: string; merchantPrivateKey: string; platformPublicKey: string },
  options: { maxAttempts?: number; unavailableMessage?: string } = {}
): Promise<Record<string, unknown>> {
  const maxAttempts = options.maxAttempts ?? 10;
  const backoffMs = [150, 300, 500, 800, 800, 1000, 1200, 1500, 1800, 2000];
  // V2 签名由 buildNimanRequest 完成（添加 pid/timestamp/sign/sign_type=RSA）
  const payload = buildNimanRequest(orderParams, epay.pid, epay.merchantPrivateKey);
  const body = new URLSearchParams(payload).toString();
  let lastNetworkError: Error | null = null;
  let lastResultWithoutQrcode: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 800);
    }
    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        response = await payment.fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
          body,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (isRetryableNetworkError(error)) {
        lastNetworkError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
      throw error;
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      if (isRetryableNetworkError(error)) {
        lastNetworkError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
      throw error;
    }
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      lastNetworkError = new Error("支付平台返回格式异常。");
      continue;
    }
    // V2: code=0 表示成功（V1 用 code=1）
    if (!response.ok || Number(result.code) !== 0) {
      throw new PublicError(String(result.msg ?? "聚合支付下单失败。"), "EPAY_CREATE_FAILED", 502);
    }
    // V2: 验证返回数据签名
    if (!verifyNimanParams(result, epay.platformPublicKey)) {
      throw new PublicError("支付平台返回数据验签失败。", "EPAY_VERIFY_FAILED", 502);
    }
    // niman V2 返回 pay_info（跳转/二维码 URL）+ pay_type（jump/qrcode），不返回 qrcode 字段
    if (result.qrcode || result.pay_info) return result;
    lastNetworkError = null;
    lastResultWithoutQrcode = result;
  }

  if (lastResultWithoutQrcode) return lastResultWithoutQrcode;
  throw new PublicError(
    options.unavailableMessage ?? "支付平台连接不稳定，请稍后重试。",
    "EPAY_UNAVAILABLE",
    502
  );
}

export function normalizeClientIp(value: unknown): string {
  const text = String(value ?? "").split(",")[0]?.trim() ?? "";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) {
    // niman V2 API 拒绝私有/回环 IP（返回"系统异常无法完成付款"），需要公网 IP
    const parts = text.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    const isPrivate = a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a === 127;
    if (!isPrivate) return text;
  }
  // 私有 IP 或无效 IP：回退到服务器公网 IP（niman 要求 clientip 为公网 IP）
  return process.env.PUBLIC_IP || "182.92.240.185";
}

function normalizeEpayDevice(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  return ["pc", "mobile", "qq", "wechat", "alipay", "jump"].includes(text) ? text : "pc";
}

// 前端支付方式 → 易支付平台 type 参数映射
export function epayPaymentType(method: unknown): "alipay" | "wxpay" {
  const text = String(method ?? "alipay").trim().toLowerCase();
  return text === "wechat" || text === "wxpay" ? "wxpay" : "alipay";
}

// 易支付平台 type → 前端展示用 method 名称
export function epayTypeToMethod(type: string | null): "alipay" | "wechat" {
  return type === "wxpay" ? "wechat" : "alipay";
}

function publicOrder(order: CreditOrderRow & { qrCode?: string; payUrl?: string; qrDataUrl?: string; refreshable?: boolean; oldUserBonus?: number }) {
  const method = epayTypeToMethod(order.payment_type);
  // viewStatus 为前端展示态，向后兼容保留原始 status（其他客户端仍用 created/waiting/paid/closed/failed/expired）
  return {
    outTradeNo: order.out_trade_no,
    status: order.status,
    viewStatus: orderViewStatus(order.status),
    provider: "epay",
    method,
    packageId: order.package_id,
    packageName: order.package_name,
    amount: order.amount,
    baseCredits: Number(order.base_credits),
    bonusCredits: Number(order.bonus_credits),
    totalCredits: Number(order.total_credits),
    oldUserBonus: order.oldUserBonus ?? 0,
    subject: order.subject,
    qrCode: order.qrCode ?? "",
    payUrl: order.payUrl ?? "",
    qrDataUrl: order.qrDataUrl ?? "",
    tradeStatus: order.provider_status ?? "",
    expiresAt: order.expires_at ?? "",
    paidAt: order.paid_at ?? "",
    refreshable: order.refreshable ?? false
  };
}

// 订单硬性生命周期上限：自创建起 60 分钟内允许刷新续期，超过则必须新建订单（防止无限续期占用）
const ORDER_REFRESH_HARD_CAP_MS = 60 * 60 * 1000;

// 前端展示态映射：保留原始 status 向后兼容，viewStatus 供新版前端状态机使用
export function orderViewStatus(status: string): "pending" | "paid" | "expired" | "closed" {
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  if (["closed", "failed"].includes(status)) return "closed";
  return "pending";
}

export function orderRefreshable(order: { status: string; created_at?: Date | string | null }, now = Date.now()): boolean {
  if (["paid", "closed", "failed"].includes(order.status)) return false;
  const createdAt = order.created_at ? new Date(String(order.created_at)).getTime() : 0;
  return Number.isFinite(createdAt) && now - createdAt < ORDER_REFRESH_HARD_CAP_MS;
}

// 自动过期：PENDING 态（created/waiting）且超过 expires_at 则标记 expired
async function autoExpireCreditOrder(deps: ActionDependencies, outTradeNo: string, status: string, expiresAt: Date | string | null): Promise<boolean> {
  if (["paid", "closed", "failed", "expired"].includes(status)) return false;
  if (!expiresAt) return false;
  if (new Date(String(expiresAt)).getTime() > Date.now()) return false;
  await deps.db.query(
    "UPDATE orders SET status = 'expired', updated_at = now() WHERE out_trade_no = $1 AND status NOT IN ('paid','closed','failed','expired')",
    [outTradeNo]
  ).catch(() => undefined);
  return true;
}

function publicPackages() {
  return CREDIT_PACKAGES.map((item) => ({
    ...item,
    totalCredits: item.baseCredits + item.bonusCredits
  }));
}

interface EpayQueryResponse extends Record<string, unknown> {
  code?: unknown;
  status?: unknown;
  trade_status?: unknown;
  trade_no?: unknown;
  money?: unknown;
  total_amount?: unknown;
  buyer?: unknown;
  buyer_id?: unknown;
  msg?: unknown;
}

// Compatibility helper for legacy EPay query responses and reconciliation tests.
// It creates the callback-shaped MD5 payload without mutating provider data.
export function epayQuerySettlementPayload(
  provider: EpayQueryResponse,
  order: { out_trade_no: string; amount: string; subject?: string },
  accountId: string,
  pid: string,
  key: string
): Record<string, string> {
  const payload: Record<string, string> = {
    pid,
    trade_no: String(provider.trade_no ?? order.out_trade_no),
    out_trade_no: order.out_trade_no,
    trade_status: String(provider.trade_status ?? (String(provider.status ?? "") === "1" || String(provider.code ?? "") === "1" ? "TRADE_SUCCESS" : "TRADE_FAILED")),
    money: String(provider.money ?? provider.total_amount ?? order.amount),
    param: accountId,
    sign_type: "MD5"
  };
  payload.sign = signEpayParams(payload, key);
  return payload;
}

// V2: 查询订单并直接用平台返回的签名数据进行结算（响应已由平台 RSA 签名）
export async function reconcileEpayCreditOrder(
  deps: ActionDependencies,
  config: PaymentRuntimeConfig,
  account: AccountRow,
  order: CreditOrderRow
): Promise<void> {
  if (["paid", "closed", "failed"].includes(order.status)) return;
  const epay = config.epay;
  // V2 查询接口：api/pay/query，使用 RSA 签名
  // 按 SDK 规范优先使用平台订单号 trade_no 查询；订单刚创建尚未拿到 trade_no 时回退到 out_trade_no
  const queryParamKey = order.provider_trade_no ? "trade_no" : "out_trade_no";
  const queryParamValue = order.provider_trade_no ?? order.out_trade_no;
  const queryParams = buildNimanRequest(
    { [queryParamKey]: queryParamValue },
    epay.pid,
    epay.merchantPrivateKey
  );
  const endpoint = buildEpayUrl(epay.apiUrl, "api/pay/query");
  const response = await paymentDeps(deps).fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(queryParams).toString()
  });
  const raw = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("聚合易支付查单返回格式异常。");
  }
  if (!response.ok) throw new Error(`聚合易支付查单失败：${response.status}`);
  // V2: code=0 表示成功
  if (Number(result.code) !== 0) {
    await deps.db.query(
      "UPDATE orders SET error_message = $2, updated_at = now() WHERE out_trade_no = $1",
      [order.out_trade_no, String(result.msg ?? "聚合易支付暂未查到该订单。").slice(0, 500)]
    );
    return;
  }
  // V2: 验证返回数据签名
  if (!verifyNimanParams(result, epay.platformPublicKey)) {
    throw new Error("聚合易支付查单返回数据验签失败。");
  }

  const providerStatus = String(result.trade_status ?? result.status ?? "").slice(0, 80);
  const providerTradeNo = String(result.trade_no ?? order.provider_trade_no ?? "").slice(0, 160);
  await deps.db.query(
    `UPDATE orders SET provider_status = NULLIF($2,''), provider_trade_no = NULLIF($3,''), updated_at = now() WHERE out_trade_no = $1`,
    [order.out_trade_no, providerStatus, providerTradeNo]
  );

  // V2: status=1 或 trade_status=TRADE_SUCCESS 表示已支付
  const paid = String(result.status ?? "") === "1" || String(result.trade_status ?? "").toUpperCase() === "TRADE_SUCCESS";
  if (!paid) return;

  // 直接用平台返回的签名数据结算（settlePaymentCallback 会用平台公钥验签）
  const outcome = await settlePaymentCallback(deps.db, config, "epay", result as PaymentParams);
  if (!outcome.accepted && outcome.reason !== "duplicate_event") {
    throw new Error(`聚合易支付查单结算未通过：${outcome.reason}`);
  }
}

// Reconcile independently of client polling because provider callbacks can be delayed or dropped.
export async function reconcilePendingCreditOrders(deps: ActionDependencies, limit = 50): Promise<{ checked: number; settled: number }> {
  const config = await runtimePaymentConfig(deps);
  if (!paymentReadiness(config).epay) return { checked: 0, settled: 0 };
  const result = await deps.db.query<CreditOrderRow & { account_id: string; email: string; credits: string | number; account_status: string; total_charged_credits: string | number }>(
    `SELECT o.out_trade_no, o.status, o.provider, o.payment_type, o.package_id, o.package_name,
            o.amount, o.base_credits, o.bonus_credits, o.total_credits, o.subject,
            o.provider_trade_no, o.provider_status, o.expires_at, o.paid_at, o.created_at,
            a.account_id, a.email, ca.credits, ca.total_charged_credits, a.status AS account_status
       FROM orders o JOIN accounts a ON a.account_id = o.account_id
       JOIN credit_accounts ca ON ca.account_id = a.account_id
      WHERE o.order_type = 'credits' AND o.provider = 'epay'
        AND o.status IN ('created', 'waiting')
        AND o.created_at >= now() - interval '24 hours'
      ORDER BY o.created_at ASC LIMIT $1`,
    [Math.max(1, Math.min(200, limit))]
  );
  let settled = 0;
  for (const row of result.rows) {
    try {
      await reconcileEpayCreditOrder(deps, config, { account_id: row.account_id, email: row.email, status: row.account_status, credits: row.credits, total_charged_credits: row.total_charged_credits }, row);
      const state = await deps.db.query<{ status: string }>("SELECT status FROM orders WHERE out_trade_no = $1", [row.out_trade_no]);
      if (state.rows[0]?.status === "paid") settled += 1;
    } catch (error) {
      await deps.db.query("UPDATE orders SET error_message = $2, updated_at = now() WHERE out_trade_no = $1", [row.out_trade_no, (error instanceof Error ? error.message : String(error)).slice(0, 500)]).catch(() => undefined);
    }
  }
  return { checked: result.rows.length, settled };
}

function licenseDays(input: ActionInput): number {
  const days = Number(input.days ?? 0);
  if (![30, 90, 365].includes(days)) throw new PublicError("请选择有效授权套餐。", "INVALID_LICENSE_PLAN");
  return days;
}

function licenseAmount(setting: Record<string, unknown>, days: number): string {
  const prices = setting.prices && typeof setting.prices === "object" && !Array.isArray(setting.prices)
    ? setting.prices as Record<string, unknown>
    : {};
  const amount = Number(prices[String(days)] ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new PublicError("授权套餐价格无效。", "INVALID_LICENSE_PRICE", 503);
  return amount.toFixed(2);
}

function alipayTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

async function createLicensePaymentOrder(deps: ActionDependencies, input: ActionInput): Promise<Record<string, unknown>> {
  const payment = paymentDeps(deps);
  const setting = deps.settings ? await loadPaymentSetting(deps) : {};
  const config = deps.settings ? paymentRuntimeFromSetting(setting) : payment.config;
  const ready = paymentReadiness(config);
  const provider = String(input.provider ?? "alipay").trim().toLowerCase() === "wechat" ? "wechat" : "alipay";
  if ((provider === "alipay" && !ready.alipay) || (provider === "wechat" && !ready.wechat)) {
    throw new PublicError("所选支付方式暂未开放。", "PAYMENT_METHOD_NOT_READY", 503);
  }
  const days = licenseDays(input);
  const amount = deps.settings ? licenseAmount(setting, days) : "0.00";
  const deviceId = String(input.deviceId ?? "").trim().slice(0, 160);
  const requestedFulfillmentMode = String(input.fulfillmentMode ?? (deviceId ? "bind_device" : "issue_code"));
  const fulfillmentMode = !deviceId || requestedFulfillmentMode === "issue_code" ? "issue_code" : "bind_device";
  if (fulfillmentMode === "bind_device" && !deviceId) throw new PublicError("无法识别当前设备，请重新打开插件。", "DEVICE_REQUIRED");
  const outTradeNo = `PAY${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const subject = `网页学习助手 ${days === 30 ? "月度" : days === 90 ? "季度" : "年度"}授权`;
  const inserted = await deps.db.query<Record<string, unknown>>(
    `INSERT INTO orders(out_trade_no, provider, order_type, status, amount, subject, days, device_id,
       fulfillment_mode, expires_at, created_at, updated_at)
     VALUES ($1,$2,'license','created',$3,$4,$5,NULLIF($6,''),$7,now()+interval '2 hours',now(),now()) RETURNING *`,
    [outTradeNo, provider, amount, subject, days, deviceId, fulfillmentMode]
  );
  try {
    let target = "";
    let providerTradeNo = "";
    if (provider === "alipay") {
      const params: Record<string, unknown> = {
        app_id: config.alipay.appId,
        method: "alipay.trade.precreate",
        format: "JSON",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: alipayTimestamp(),
        version: "1.0",
        notify_url: config.alipay.notifyUrl,
        biz_content: JSON.stringify({ out_trade_no: outTradeNo, total_amount: amount, subject, timeout_express: "2h" })
      };
      params.sign = signAlipayParams(params, config.alipay.privateKey);
      const response = await payment.fetch(config.alipay.gatewayUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString() });
      const payload = await response.json() as { alipay_trade_precreate_response?: { code?: string; msg?: string; sub_msg?: string; qr_code?: string } };
      const value = payload.alipay_trade_precreate_response;
      if (!response.ok || value?.code !== "10000" || !value.qr_code) throw new PublicError(value?.sub_msg ?? value?.msg ?? "支付宝下单失败。", "ALIPAY_CREATE_FAILED", 502);
      target = value.qr_code;
    } else {
      const payload: Record<string, unknown> = { mchid: config.payjs.mchId, total_fee: Math.round(Number(amount) * 100), out_trade_no: outTradeNo, body: subject, notify_url: config.payjs.notifyUrl, attach: JSON.stringify({ orderType: "license" }) };
      payload.sign = signPayjsParams(payload, config.payjs.key);
      const response = await payment.fetch(config.payjs.nativeUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)])).toString() });
      const value = await response.json() as Record<string, unknown>;
      if (!response.ok || Number(value.return_code) !== 1) throw new PublicError(String(value.return_msg ?? "微信支付下单失败。"), "PAYJS_CREATE_FAILED", 502);
      target = String(value.qrcode ?? value.code_url ?? "");
      providerTradeNo = String(value.payjs_order_id ?? "");
      if (!target) throw new PublicError("支付平台未返回付款地址。", "PAYMENT_TARGET_MISSING", 502);
    }
    const qrDataUrl = await QRCode.toDataURL(target, { errorCorrectionLevel: "M", margin: 1, width: 260 });
    const updated = await deps.db.query<Record<string, unknown>>(
      `UPDATE orders SET status='waiting', provider_trade_no=NULLIF($2,''), qr_code=$3, pay_url=$3,
       qr_data_url=$4, updated_at=now() WHERE out_trade_no=$1 RETURNING *`,
      [outTradeNo, providerTradeNo, target, qrDataUrl]
    );
    const row = updated.rows[0] ?? inserted.rows[0]!;
    return { order: { outTradeNo, status: String(row.status), provider, providerLabel: provider === "wechat" ? "微信支付" : "支付宝", fulfillmentMode, days, amount, subject, qrCode: target, payUrl: target, qrDataUrl, licenseCode: "", tradeStatus: "", payjsOrderId: providerTradeNo, expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : "", paidAt: "" } };
  } catch (error) {
    await deps.db.query("UPDATE orders SET status='failed', error_message=$2, updated_at=now() WHERE out_trade_no=$1", [outTradeNo, error instanceof Error ? error.message : String(error)]);
    throw error;
  }
}

async function queryLicensePaymentOrder(deps: ActionDependencies, input: ActionInput): Promise<Record<string, unknown>> {
  const outTradeNo = String(input.outTradeNo ?? "").trim();
  if (!outTradeNo) throw new PublicError("订单号不能为空。", "ORDER_NO_REQUIRED");
  const result = await deps.db.query<Record<string, unknown>>("SELECT * FROM orders WHERE out_trade_no=$1 AND order_type='license'", [outTradeNo]);
  const row = result.rows[0];
  if (!row) throw new PublicError("支付订单不存在。", "ORDER_NOT_FOUND", 404);
  let license: Record<string, unknown> | null = null;
  if (row.legacy_license_code) {
    const found = await deps.db.query<Record<string, unknown>>("SELECT * FROM legacy_licenses WHERE code=$1", [row.legacy_license_code]);
    const item = found.rows[0];
    if (item) license = { code: item.code, days: Number(item.days ?? 0), status: item.status, activatedAt: item.activated_at ? new Date(String(item.activated_at)).toISOString() : "", expiresAt: item.expires_at ? new Date(String(item.expires_at)).toISOString() : "", deviceId: item.device_id ?? "" };
  }
  return { order: { outTradeNo, status: String(row.status), provider: String(row.provider), fulfillmentMode: String(row.fulfillment_mode ?? "bind_device"), days: Number(row.days ?? 0), amount: String(row.amount), subject: String(row.subject ?? ""), qrCode: String(row.qr_code ?? ""), payUrl: String(row.pay_url ?? ""), qrDataUrl: String(row.qr_data_url ?? ""), licenseCode: String(row.legacy_license_code ?? ""), tradeStatus: String(row.provider_status ?? ""), expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : "", paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : "" }, license };
}

function callbackAction(deps: ActionDependencies, provider: PaymentProvider): ActionHandler {
  return async (input) => {
    const payment = paymentDeps(deps);
    return settlePaymentCallback(deps.db, await runtimePaymentConfig(deps), provider, input);
  };
}

export function createPaymentActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const getPaymentConfig: ActionHandler = async () => {
    const setting = deps.settings ? await loadPaymentSetting(deps) : null;
    const config = setting ? paymentRuntimeFromSetting(setting) : paymentDeps(deps).config;
    const ready = paymentReadiness(config);
    const licenseConfig = setting ? publicPaymentSetting(setting) : { enabled: ready.alipay || ready.wechat, provider: "multi", methods: [], plans: [] };
    return {
      ...licenseConfig,
      creditEnabled: ready.epay,
      creditProvider: "epay",
      // niman.cn 易支付平台同时支持支付宝和微信支付
      creditMethods: ready.epay ? ["alipay", "wechat"] : [],
      providers: [
        { id: "epay", label: "支付宝", enabled: ready.epay },
        { id: "epay-wxpay", label: "微信支付", enabled: ready.epay },
        { id: "alipay", label: "支付宝官方", enabled: ready.alipay },
        { id: "wechat", label: "微信支付(PayJS)", enabled: ready.wechat }
      ],
      creditPackages: publicPackages()
    };
  };

  const createCreditOrder: ActionHandler = async (input, context) => {
    const payment = paymentDeps(deps);
    const config = await runtimePaymentConfig(deps);
    const ready = paymentReadiness(config);
    if (!ready.epay) throw new PublicError("积分充值暂未开启。", "EPAY_NOT_READY", 503);
    const account = await authenticate(deps, input);
    const pkg = creditPackage(input);
    const oldUserBonus = Number(account.total_charged_credits) > 0 ? OLD_USER_RECHARGE_BONUS : 0;
    const requestedPayType = epayPaymentType(input.method);

    // 幂等：若该账户同一套餐且同一支付方式存在未过期的待支付订单，直接复用，避免重复下单 + 重复请求 epay
    // 注意：必须按 payment_type 过滤，否则用户从支付宝切换到微信支付时会复用错误类型的订单
    const existing = await deps.db.query<CreditOrderRow>(
      `SELECT out_trade_no, status, provider, payment_type, package_id, package_name, amount, base_credits,
              bonus_credits, total_credits, subject, provider_trade_no, provider_status, expires_at, paid_at, created_at
         FROM orders
        WHERE account_id = $1 AND order_type = 'credits' AND package_id = $2
          AND payment_type = $3
          AND status IN ('created', 'waiting') AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [account.account_id, pkg.id, requestedPayType]
    );
    if (existing.rows[0]) {
      const existingOrder = existing.rows[0];
      // 已有有效二维码则直接返回；仅有订单无二维码（created 态）则继续走下单流程补出码
      const hasQr = await deps.db.query<{ qr_code: string | null }>(
        "SELECT qr_code FROM orders WHERE out_trade_no = $1",
        [existingOrder.out_trade_no]
      );
      if (hasQr.rows[0]?.qr_code) {
        const qrDataUrl = await QRCode.toDataURL(String(hasQr.rows[0].qr_code), { errorCorrectionLevel: "M", margin: 1, width: 260 });
        return publicOrder({
          ...existingOrder,
          status: "waiting",
          qrCode: String(hasQr.rows[0].qr_code),
          payUrl: String(hasQr.rows[0].qr_code),
          qrDataUrl,
          oldUserBonus,
          refreshable: orderRefreshable(existingOrder)
        });
      }
      // 复用订单号，跳过 INSERT，直接请求 niman V2 出码
      const epay = config.epay;
      const subject = existingOrder.subject || `QuizMate ${pkg.name} ${pkg.baseCredits + pkg.bonusCredits}积分`;
      const outTradeNo = existingOrder.out_trade_no;
      const payType = epayPaymentType(existingOrder.payment_type);
      const orderParams: NimanParams = {
        type: payType,
        out_trade_no: outTradeNo,
        notify_url: epay.notifyUrl,
        return_url: epay.returnUrl,
        name: subject,
        money: String(existingOrder.amount),
        param: account.account_id,
        clientip: normalizeClientIp(context.clientIp)
      };
      try {
        const result = await callNimanCreate(payment, buildEpayUrl(epay.apiUrl, "api/pay/create"), orderParams, epay, {
          maxAttempts: 10,
          unavailableMessage: "支付平台连接不稳定，请稍后重试。"
        });
        // niman V2 返回 pay_info（跳转/二维码 URL），优先使用
        const target = String(result.qrcode ?? result.pay_info ?? result.payurl ?? result.urlscheme ?? "");
        if (!target) throw new PublicError("支付平台未返回付款地址。", "EPAY_TARGET_MISSING", 502);
        const qrCode = String(result.qrcode ?? result.pay_info ?? target);
        const payUrl = String(result.pay_info ?? result.payurl ?? result.urlscheme ?? target);
        const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 260 });
        await deps.db.query(
          `UPDATE orders SET status = 'waiting', qr_code = $2, pay_url = $3, qr_data_url = $4,
              provider_trade_no = NULLIF($5,''), expires_at = now() + interval '15 minutes', updated_at = now()
            WHERE out_trade_no = $1`,
          [outTradeNo, qrCode, payUrl, qrDataUrl, String(result.trade_no ?? "")]
        );
        return publicOrder({ ...existingOrder, status: "waiting", qrCode, payUrl, qrDataUrl, oldUserBonus, refreshable: orderRefreshable(existingOrder) });
      } catch (error) {
        const errMsg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        await deps.db.query(
          "UPDATE orders SET status = 'failed', error_message = $2, updated_at = now() WHERE out_trade_no = $1",
          [outTradeNo, errMsg]
        );
        throw error;
      }
    }

    const outTradeNo = `CR${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const subject = `QuizMate ${pkg.name} ${pkg.baseCredits + pkg.bonusCredits}积分`;
    const payType = requestedPayType;
    // 订单有效期 15 分钟；二维码倒计时同样基于 expires_at，到期后可调用 refreshCreditQrCode 续期并重新出码
    const inserted = await deps.db.query<CreditOrderRow>(
      `INSERT INTO orders(out_trade_no, provider, order_type, payment_type, account_id, email, status,
                          amount, subject, package_id, package_name, base_credits, bonus_credits,
                          total_credits, expires_at)
       VALUES ($1, 'epay', 'credits', $2, $3, $4, 'created', $5, $6, $7, $8, $9, $10, $11,
               now() + interval '15 minutes')
       RETURNING out_trade_no, status, provider, payment_type, package_id, package_name, amount, base_credits,
                 bonus_credits, total_credits, subject, provider_trade_no, provider_status, expires_at, paid_at, created_at`,
      [outTradeNo, payType, account.account_id, account.email, pkg.amount, subject, pkg.id, pkg.name,
        pkg.baseCredits, pkg.bonusCredits, pkg.baseCredits + pkg.bonusCredits]
    );
    const order = inserted.rows[0];
    if (!order) throw new Error("order insert failed");

    const epay = config.epay;
    const orderParams: NimanParams = {
      type: payType,
      out_trade_no: outTradeNo,
      notify_url: epay.notifyUrl,
      return_url: epay.returnUrl,
      name: subject,
      money: pkg.amount,
      param: account.account_id,
      clientip: normalizeClientIp(context.clientIp)
    };
    try {
      // niman V2 API：RSA 签名 + 响应验签
      // callNimanCreate 对网络错误快速重试（10 次），对"无 qrcode"也重试
      const result = await callNimanCreate(payment, buildEpayUrl(epay.apiUrl, "api/pay/create"), orderParams, epay, {
        maxAttempts: 10,
        unavailableMessage: "支付平台连接不稳定，请稍后重试。"
      });
      // niman V2 返回 pay_info（跳转/二维码 URL），优先使用
      const target = String(result.qrcode ?? result.pay_info ?? result.payurl ?? result.urlscheme ?? "");
      if (!target) throw new PublicError("支付平台未返回付款地址。", "EPAY_TARGET_MISSING", 502);
      const qrCode = String(result.qrcode ?? result.pay_info ?? target);
      const payUrl = String(result.pay_info ?? result.payurl ?? result.urlscheme ?? target);
      const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 260 });
      await deps.db.query(
        `UPDATE orders SET status = 'waiting', provider_trade_no = $2, updated_at = now()
          WHERE out_trade_no = $1`,
        [outTradeNo, String(result.trade_no ?? "")]
      );
      return publicOrder({ ...order, status: "waiting", qrCode, payUrl, qrDataUrl, oldUserBonus, refreshable: orderRefreshable({ ...order, status: "waiting" }) });
    } catch (error) {
      const errMsg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await deps.db.query(
        "UPDATE orders SET status = 'failed', error_message = $2, updated_at = now() WHERE out_trade_no = $1",
        [outTradeNo, errMsg]
      );
      throw error;
    }
  };

  const queryCreditOrder: ActionHandler = async (input) => {
    const account = await authenticate(deps, input);
    const outTradeNo = String(input.outTradeNo ?? "").trim();
    if (!outTradeNo) throw new PublicError("订单号不能为空。", "ORDER_NO_REQUIRED");
    const selectCols = `SELECT out_trade_no, status, provider, payment_type, package_id, package_name, amount, base_credits,
                bonus_credits, total_credits, subject, provider_trade_no, provider_status, expires_at, paid_at, created_at
           FROM orders WHERE out_trade_no = $1 AND account_id = $2 AND order_type = 'credits'`;
    const result = await deps.db.query<CreditOrderRow>(selectCols, [outTradeNo, account.account_id]);
    let order = result.rows[0];
    if (!order) throw new PublicError("积分订单不存在。", "ORDER_NOT_FOUND", 404);

    // 自动过期：超时未支付则置 expired，避免继续轮询/对账已失效订单
    await autoExpireCreditOrder(deps, outTradeNo, order.status, order.expires_at);

    // 仅 PENDING 态（created/waiting）才向聚合易支付对账，expired/paid/closed/failed 跳过
    if (!["paid", "closed", "failed", "expired"].includes(order.status)) {
      try {
        const config = await runtimePaymentConfig(deps);
        if (paymentReadiness(config).epay) await reconcileEpayCreditOrder(deps, config, account, order);
      } catch (error) {
        await deps.db.query(
          "UPDATE orders SET error_message = $2, updated_at = now() WHERE out_trade_no = $1",
          [outTradeNo, (error instanceof Error ? error.message : String(error)).slice(0, 500)]
        ).catch(() => undefined);
      }
    }
    const refreshed = await deps.db.query<CreditOrderRow>(selectCols, [outTradeNo, account.account_id]);
    order = refreshed.rows[0] ?? order;

    const latest = await deps.db.query<{ credits: string | number }>(
      "SELECT credits FROM credit_accounts WHERE account_id = $1",
      [account.account_id]
    );
    // 老用户充值额外赠送：已支付订单查 credit_ledger 确认实际赠送积分，未支付则按当前账户状态预估
    let oldUserBonus = 0;
    if (order.status === "paid") {
      const bonusLedger = await deps.db.query<{ credits: string | number }>(
        "SELECT credits FROM credit_ledger WHERE account_id = $1 AND order_no = $2 AND operation_type = 'old_user_bonus'",
        [account.account_id, outTradeNo]
      );
      oldUserBonus = Number(bonusLedger.rows[0]?.credits ?? 0);
    } else {
      oldUserBonus = Number(account.total_charged_credits) > 0 ? OLD_USER_RECHARGE_BONUS : 0;
    }
    const creditedCredits = order.status === "paid" ? Number(order.total_credits) + oldUserBonus : 0;
    return {
      order: publicOrder({ ...order, oldUserBonus, refreshable: orderRefreshable(order) }),
      account: { accountId: account.account_id, email: account.email, credits: Number(latest.rows[0]?.credits ?? account.credits) },
      creditedCredits,
      message: order.status === "paid"
        ? `充值成功，已到账 ${creditedCredits} 积分${oldUserBonus > 0 ? `（含老用户额外赠送 ${oldUserBonus} 积分）` : ""}。`
        : order.status === "expired"
          ? "二维码已过期，请刷新二维码或重新购买。"
          : "订单等待支付。如果您已支付完成，时间可能有点延迟，可以退出之后查看积分。"
    };
  };

  const refreshCreditQrCode: ActionHandler = async (input, context) => {
    const payment = paymentDeps(deps);
    const config = await runtimePaymentConfig(deps);
    if (!paymentReadiness(config).epay) throw new PublicError("积分充值暂未开启。", "EPAY_NOT_READY", 503);
    const account = await authenticate(deps, input);
    const oldUserBonus = Number(account.total_charged_credits) > 0 ? OLD_USER_RECHARGE_BONUS : 0;
    const outTradeNo = String(input.outTradeNo ?? "").trim();
    if (!outTradeNo) throw new PublicError("订单号不能为空。", "ORDER_NO_REQUIRED");

    const result = await deps.db.query<CreditOrderRow>(
      `SELECT out_trade_no, status, provider, payment_type, package_id, package_name, amount, base_credits,
              bonus_credits, total_credits, subject, provider_trade_no, provider_status, expires_at, paid_at, created_at
         FROM orders WHERE out_trade_no = $1 AND account_id = $2 AND order_type = 'credits'`,
      [outTradeNo, account.account_id]
    );
    const order = result.rows[0];
    if (!order) throw new PublicError("积分订单不存在。", "ORDER_NOT_FOUND", 404);
    if (order.status === "paid") throw new PublicError("订单已支付，无需刷新二维码。", "ORDER_ALREADY_PAID");
    if (["closed", "failed"].includes(order.status)) throw new PublicError("订单已关闭，请重新购买。", "ORDER_CLOSED");
    if (!orderRefreshable(order)) throw new PublicError("刷新次数已达上限，请重新购买。", "ORDER_REFRESH_LIMIT");

    const epay = config.epay;
    const payType = epayPaymentType(order.payment_type);
    const orderParams: NimanParams = {
      type: payType,
      out_trade_no: outTradeNo,
      notify_url: epay.notifyUrl,
      return_url: epay.returnUrl,
      name: order.subject,
      money: String(order.amount),
      param: account.account_id,
      clientip: normalizeClientIp(context.clientIp)
    };

    // 优先向 niman V2 重新请求二维码（同 out_trade_no 幂等，不会产生重复扣款）；
    // 若平台拒绝（订单已存在等），则用本地存储的 qr_code 重新生成二维码图片，保证可用。
    let qrCode = "";
    let payUrl = "";
    let providerTradeNo = String(order.provider_trade_no ?? "");
    try {
      // 同 createCreditOrder：用 callNimanCreate 重试获取 qrcode
      // 刷新场景有本地兜底（沿用原 qr_code），重试 8 次足够
      const parsed = await callNimanCreate(payment, buildEpayUrl(epay.apiUrl, "api/pay/create"), orderParams, epay, {
        maxAttempts: 8,
        unavailableMessage: "支付平台连接不稳定，已使用原二维码。"
      });
      // niman V2 返回 pay_info（跳转/二维码 URL），优先使用
      qrCode = String(parsed.qrcode ?? parsed.pay_info ?? parsed.payurl ?? parsed.urlscheme ?? "");
      payUrl = String(parsed.pay_info ?? parsed.payurl ?? parsed.urlscheme ?? qrCode);
      providerTradeNo = String(parsed.trade_no ?? providerTradeNo);
    } catch {
      // 网络异常时走本地兜底（沿用订单原有 qr_code）
    }

    // 兜底：平台未返回新码时，沿用订单原有 qr_code 重新出图
    if (!qrCode) {
      const fallback = await deps.db.query<{ qr_code: string | null; pay_url: string | null }>(
        "SELECT qr_code, pay_url FROM orders WHERE out_trade_no = $1",
        [outTradeNo]
      );
      qrCode = String(fallback.rows[0]?.qr_code ?? "");
      payUrl = String(fallback.rows[0]?.pay_url ?? qrCode);
    }
    if (!qrCode) throw new PublicError("无法获取二维码，请重新购买。", "EPAY_TARGET_MISSING", 502);

    const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 260 });
    const updated = await deps.db.query<CreditOrderRow>(
      `UPDATE orders
          SET status = 'waiting', qr_code = $2, pay_url = $3, qr_data_url = $4,
              provider_trade_no = NULLIF($5,''), expires_at = now() + interval '15 minutes',
              updated_at = now()
        WHERE out_trade_no = $1
        RETURNING out_trade_no, status, provider, payment_type, package_id, package_name, amount, base_credits,
                  bonus_credits, total_credits, subject, provider_trade_no, provider_status, expires_at, paid_at, created_at`,
      [outTradeNo, qrCode, payUrl, qrDataUrl, providerTradeNo]
    );
    const refreshed = updated.rows[0] ?? order;
    return publicOrder({ ...refreshed, status: "waiting", qrCode, payUrl, qrDataUrl, oldUserBonus, refreshable: orderRefreshable({ ...refreshed, status: "waiting" }) });
  };

  return new Map([
    ["getPaymentConfig", getPaymentConfig],
    ["createCreditOrder", createCreditOrder],
    ["queryCreditOrder", queryCreditOrder],
    ["refreshCreditQrCode", refreshCreditQrCode],
    ["createPaymentOrder", (input) => createLicensePaymentOrder(deps, input)],
    ["queryPaymentOrder", (input) => queryLicensePaymentOrder(deps, input)],
    ["alipayNotify", callbackAction(deps, "alipay")],
    ["payjsNotify", callbackAction(deps, "payjs")],
    ["epayNotify", callbackAction(deps, "epay")]
  ]);
}
