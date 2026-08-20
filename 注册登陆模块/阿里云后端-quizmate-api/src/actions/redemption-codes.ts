import crypto from "node:crypto";
import QRCode from "qrcode";
import type { PoolClient } from "pg";
import { CREDIT_PACKAGES } from "../domain/credits.js";
import { PublicError } from "../errors.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";
import { paymentReadiness, type PaymentRuntimeConfig } from "../payments/config.js";
import { buildNimanRequest, verifyNimanParams, type NimanParams } from "../payments/niman-rsa.js";
import {
  paymentDeps,
  runtimePaymentConfig,
  authenticate,
  buildEpayUrl,
  callNimanCreate,
  normalizeClientIp,
  epayPaymentType,
  epayTypeToMethod,
  orderRefreshable
} from "./payments.js";
import { authenticateAdmin } from "./admin.js";

// ─── 工具函数 ────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字符 0/O/1/I

function generateCode(): string {
  let p1 = "";
  let p2 = "";
  for (let i = 0; i < 6; i++) p1 += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  for (let i = 0; i < 6; i++) p2 += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return `QM-${p1}-${p2}`;
}

function creditPackageById(id: string) {
  const found = CREDIT_PACKAGES.find((item) => item.id === id);
  if (!found) throw new PublicError("积分套餐不存在。", "PACKAGE_NOT_FOUND", 404);
  return found;
}

function date(value: unknown): string {
  if (!value) return "";
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function paging(input: ActionInput) {
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize ?? input.limit ?? 20))));
  const requestedPage = Math.max(1, Math.floor(Number(input.page ?? 1)));
  return { pageSize, requestedPage };
}

// ─── 用户端：兑换码兑换 ──────────────────────────────────

const redeemCode: ActionHandler = async (input) => {
  const account = await authenticate(deps, input);
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!code) throw new PublicError("请输入兑换码。", "CODE_REQUIRED");

  const client = await deps.db.connect();
  try {
    await client.query("BEGIN");

    // 引流限制：每个账户仅能成功兑换一次兑换码（兑换码用于外部平台引流新用户）
    const redeemedBefore = await client.query<{ redeemed_at: Date | string }>(
      "SELECT redeemed_at FROM redemption_codes WHERE redeemed_by = $1 LIMIT 1",
      [account.account_id]
    );
    if (redeemedBefore.rowCount) {
      await client.query("COMMIT");
      throw new PublicError("每个账户只能兑换一次兑换码，该账户已完成兑换。", "REDEEM_LIMIT_REACHED", 403);
    }

    // 查找兑换码，加行锁防止并发兑换
    const codeResult = await client.query<{
      code_id: string; code: string; package_id: string; package_name: string;
      base_credits: string | number; bonus_credits: string | number; total_credits: string | number;
      status: string; expires_at: Date | string | null;
    }>(
      `SELECT code_id, code, package_id, package_name, base_credits, bonus_credits, total_credits,
              status, expires_at
         FROM redemption_codes WHERE code = $1 FOR UPDATE`,
      [code]
    );
    const redemption = codeResult.rows[0];
    if (!redemption) throw new PublicError("兑换码不存在。", "CODE_NOT_FOUND", 404);
    if (redemption.status === "redeemed") throw new PublicError("该兑换码已被使用。", "CODE_ALREADY_REDEEMED");
    if (redemption.status === "disabled") throw new PublicError("该兑换码已被禁用。", "CODE_DISABLED");
    if (redemption.status !== "unused") throw new PublicError("该兑换码不可用。", "CODE_INVALID");

    // 检查过期
    if (redemption.expires_at && new Date(String(redemption.expires_at)).getTime() < Date.now()) {
      await client.query("UPDATE redemption_codes SET status = 'disabled', note = COALESCE(note,'') || '自动过期' WHERE code_id = $1", [redemption.code_id]);
      await client.query("COMMIT");
      throw new PublicError("该兑换码已过期。", "CODE_EXPIRED");
    }

    const totalCredits = Number(redemption.total_credits);
    if (totalCredits <= 0) throw new PublicError("兑换码积分异常。", "CODE_INVALID_CREDITS");

    // 加积分
    const creditResult = await client.query<{ credits: string | number }>(
      `UPDATE credit_accounts
          SET credits = credits + $2,
              total_charged_credits = total_charged_credits + $2,
              updated_at = now()
        WHERE account_id = $1
        RETURNING credits`,
      [account.account_id, totalCredits]
    );
    const balance = creditResult.rows[0]?.credits;
    if (balance === undefined) throw new PublicError("积分账户不存在，请先登录客户端生成账户。", "ACCOUNT_NOT_FOUND", 404);

    // 记录流水
    await client.query(
      `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, package_id, reason)
       VALUES ($1, 'recharge', $2, $3, 'redemption', $4, 'redemption_code')`,
      [account.account_id, totalCredits, Number(balance), redemption.package_id]
    );

    // 标记码为已兑换
    await client.query(
      `UPDATE redemption_codes
          SET status = 'redeemed', redeemed_by = $2, redeemed_email = $3,
              redeemed_at = now(), updated_at = now()
        WHERE code_id = $1`,
      [redemption.code_id, account.account_id, account.email]
    );

    await client.query("COMMIT");
    return {
      success: true,
      message: `兑换成功！已到账 ${totalCredits} 积分。`,
      packageName: redemption.package_name,
      credits: totalCredits,
      balance: Number(balance)
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

// ─── 用户端：店铺商品列表 ──────────────────────────────────

const listShopProducts: ActionHandler = async () => {
  const result = await deps.db.query<{
    product_id: string; name: string; description: string | null;
    package_id: string; price: string; sort_order: string | number;
  }>(
    `SELECT product_id, name, description, package_id, price, sort_order
       FROM shop_products
      WHERE status = 'active'
      ORDER BY sort_order ASC, product_id ASC`
  );
  return {
    products: result.rows.map((row) => {
      const pkg = CREDIT_PACKAGES.find((item) => item.id === row.package_id);
      return {
        productId: Number(row.product_id),
        name: row.name,
        description: row.description ?? "",
        packageId: row.package_id,
        packageName: pkg?.name ?? "",
        price: row.price,
        baseCredits: pkg?.baseCredits ?? 0,
        bonusCredits: pkg?.bonusCredits ?? 0,
        totalCredits: (pkg?.baseCredits ?? 0) + (pkg?.bonusCredits ?? 0)
      };
    })
  };
};

// ─── 用户端：创建店铺订单 ──────────────────────────────────

const createShopOrder: ActionHandler = async (input, context) => {
  const payment = paymentDeps(deps);
  const config = await runtimePaymentConfig(deps);
  const ready = paymentReadiness(config);
  if (!ready.epay) throw new PublicError("支付暂未开启。", "EPAY_NOT_READY", 503);

  const productId = Number(input.productId ?? 0);
  if (!productId) throw new PublicError("请选择商品。", "PRODUCT_REQUIRED");

  const buyerEmail = String(input.buyerEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
  const buyerName = String(input.buyerName ?? "").trim().slice(0, 100);
  const payType = epayPaymentType(input.method);

  // 查找商品
  const productResult = await deps.db.query<{
    product_id: string; name: string; package_id: string; price: string;
  }>(
    `SELECT product_id, name, package_id, price FROM shop_products WHERE product_id = $1 AND status = 'active'`,
    [productId]
  );
  const product = productResult.rows[0];
  if (!product) throw new PublicError("商品不存在或已下架。", "PRODUCT_NOT_FOUND", 404);

  const pkg = creditPackageById(product.package_id);
  const outTradeNo = `SHOP${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const subject = `QuizMate 兑换码 - ${product.name}`;
  const totalCredits = pkg.baseCredits + pkg.bonusCredits;

  // 创建 orders 记录（order_type='shop_credits'）
  await deps.db.query(
    `INSERT INTO orders(out_trade_no, provider, order_type, status, amount, subject,
        package_id, package_name, base_credits, bonus_credits, total_credits, email, expires_at)
     VALUES ($1, 'epay', 'shop_credits', 'created', $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '15 minutes')`,
    [outTradeNo, product.price, subject, pkg.id, pkg.name, pkg.baseCredits, pkg.bonusCredits, totalCredits, buyerEmail]
  );

  // 创建 shop_orders 记录
  await deps.db.query(
    `INSERT INTO shop_orders(order_no, product_id, product_name, package_id, price,
        buyer_email, buyer_name, status, payment_method, provider, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'created', $8, 'epay', now() + interval '15 minutes')`,
    [outTradeNo, productId, product.name, pkg.id, product.price, buyerEmail, buyerName, payType]
  );

  // 调用 epay 出二维码
  const epay = config.epay;
  const orderParams: NimanParams = {
    type: payType,
    out_trade_no: outTradeNo,
    notify_url: epay.notifyUrl,
    return_url: epay.returnUrl,
    name: subject,
    money: product.price,
    param: `shop:${outTradeNo}`,
    clientip: normalizeClientIp(context.clientIp)
  };

  try {
    const result = await callNimanCreate(payment, buildEpayUrl(epay.apiUrl, "api/pay/create"), orderParams, epay, {
      maxAttempts: 10,
      unavailableMessage: "支付平台连接不稳定，请稍后重试。"
    });
    const target = String(result.qrcode ?? result.pay_info ?? result.payurl ?? result.urlscheme ?? "");
    if (!target) throw new PublicError("支付平台未返回付款地址。", "EPAY_TARGET_MISSING", 502);
    const qrCode = String(result.qrcode ?? result.pay_info ?? target);
    const payUrl = String(result.pay_info ?? result.payurl ?? result.urlscheme ?? target);
    const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 260 });
    await deps.db.query(
      `UPDATE orders SET status = 'waiting', provider_trade_no = $2, updated_at = now() WHERE out_trade_no = $1`,
      [outTradeNo, String(result.trade_no ?? "")]
    );
    await deps.db.query(
      `UPDATE shop_orders SET status = 'waiting', qr_code = $2, pay_url = $3, qr_data_url = $4,
          provider_trade_no = $5, updated_at = now() WHERE order_no = $1`,
      [outTradeNo, qrCode, payUrl, qrDataUrl, String(result.trade_no ?? "")]
    );
    return publicShopOrder({
      orderNo: outTradeNo, status: "waiting", packageName: pkg.name, productName: product.name,
      price: product.price, method: payType === "wxpay" ? "wechat" : "alipay",
      qrDataUrl, totalCredits, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  } catch (error) {
    const errMsg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await deps.db.query("UPDATE orders SET status = 'failed', error_message = $2 WHERE out_trade_no = $1", [outTradeNo, errMsg]);
    await deps.db.query("UPDATE shop_orders SET status = 'failed', error_message = $2 WHERE order_no = $1", [outTradeNo, errMsg]);
    throw error;
  }
};

// ─── 用户端：查询店铺订单 ──────────────────────────────────

interface ShopOrderRow {
  order_no: string; status: string; product_name: string; package_id: string;
  price: string; buyer_email: string; payment_method: string | null;
  provider_trade_no: string | null; provider_status: string | null;
  qr_code: string | null; pay_url: string | null; qr_data_url: string | null;
  redemption_code: string | null; expires_at: Date | string | null;
  paid_at: Date | string | null; created_at: Date | string | null;
}

function publicShopOrder(row: Partial<ShopOrderRow> & {
  orderNo?: string; status?: string; packageName?: string; productName?: string;
  price?: string; method?: string; qrDataUrl?: string; totalCredits?: number; expiresAt?: string;
}) {
  return {
    orderNo: row.orderNo ?? row.order_no ?? "",
    status: row.status ?? "",
    productName: row.productName ?? row.product_name ?? "",
    price: row.price ?? "",
    method: row.method ?? epayTypeToMethod(row.payment_method ?? null),
    qrDataUrl: row.qrDataUrl ?? row.qr_data_url ?? "",
    redemptionCode: row.redemption_code ?? "",
    expiresAt: row.expiresAt ?? (row.expires_at ? new Date(String(row.expires_at)).toISOString() : ""),
    paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : "",
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : ""
  };
}

const queryShopOrder: ActionHandler = async (input) => {
  const orderNo = String(input.orderNo ?? "").trim();
  if (!orderNo) throw new PublicError("订单号不能为空。", "ORDER_NO_REQUIRED");

  const selectCols = `SELECT order_no, status, product_name, package_id, price, buyer_email,
           payment_method, provider_trade_no, provider_status, qr_code, pay_url, qr_data_url,
           redemption_code, expires_at, paid_at, created_at
      FROM shop_orders WHERE order_no = $1`;
  const result = await deps.db.query<ShopOrderRow>(selectCols, [orderNo]);
  let order = result.rows[0];
  if (!order) throw new PublicError("订单不存在。", "ORDER_NOT_FOUND", 404);

  // 自动过期
  if (!["paid", "fulfilled", "cancelled", "failed", "expired"].includes(order.status)) {
    if (order.expires_at && new Date(String(order.expires_at)).getTime() < Date.now()) {
      await deps.db.query(
        "UPDATE shop_orders SET status = 'expired', updated_at = now() WHERE order_no = $1 AND status NOT IN ('paid','fulfilled','cancelled','failed','expired')",
        [orderNo]
      ).catch(() => undefined);
      await deps.db.query(
        "UPDATE orders SET status = 'expired', updated_at = now() WHERE out_trade_no = $1 AND status NOT IN ('paid','closed','failed','expired')",
        [orderNo]
      ).catch(() => undefined);
    }
  }

  // 待支付态时主动对账
  if (!["paid", "fulfilled", "cancelled", "failed", "expired"].includes(order.status)) {
    try {
      const config = await runtimePaymentConfig(deps);
      if (paymentReadiness(config).epay) {
        await reconcileShopOrder(deps, config, order);
      }
    } catch (error) {
      await deps.db.query(
        "UPDATE shop_orders SET error_message = $2, updated_at = now() WHERE order_no = $1",
        [orderNo, (error instanceof Error ? error.message : String(error)).slice(0, 500)]
      ).catch(() => undefined);
    }
  }

  const refreshed = await deps.db.query<ShopOrderRow>(selectCols, [orderNo]);
  order = refreshed.rows[0] ?? order;

  const pkg = CREDIT_PACKAGES.find((item) => item.id === order.package_id);
  return {
    order: publicShopOrder({
      ...order,
      productName: order.product_name,
      totalCredits: pkg ? pkg.baseCredits + pkg.bonusCredits : 0
    }),
    message: order.status === "fulfilled"
      ? "支付成功！兑换码已生成，请查收邮箱。"
      : order.status === "paid"
        ? "支付成功，正在生成兑换码..."
        : order.status === "expired"
          ? "二维码已过期，请重新下单。"
          : "订单等待支付。"
  };
};

// 店铺订单主动对账（类似 reconcileEpayCreditOrder）
async function reconcileShopOrder(deps: ActionDependencies, config: PaymentRuntimeConfig, order: ShopOrderRow): Promise<void> {
  if (["paid", "fulfilled", "cancelled", "failed"].includes(order.status)) return;
  const epay = config.epay;
  const queryParamKey = order.provider_trade_no ? "trade_no" : "out_trade_no";
  const queryParamValue = order.provider_trade_no ?? order.order_no;
  const queryParams = buildNimanRequest({ [queryParamKey]: queryParamValue }, epay.pid, epay.merchantPrivateKey);
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
  if (Number(result.code) !== 0) return;

  // 验签
  if (!verifyNimanParams(result, epay.platformPublicKey)) throw new Error("聚合易支付查单返回数据验签失败。");

  const providerStatus = String(result.trade_status ?? result.status ?? "").slice(0, 80);
  const providerTradeNo = String(result.trade_no ?? order.provider_trade_no ?? "").slice(0, 160);
  await deps.db.query(
    "UPDATE shop_orders SET provider_status = $2, provider_trade_no = $3, updated_at = now() WHERE order_no = $1",
    [order.order_no, providerStatus, providerTradeNo]
  );

  const paid = String(result.status ?? "") === "1" || String(result.trade_status ?? "").toUpperCase() === "TRADE_SUCCESS";
  if (!paid) return;

  // 直接用平台返回数据触发结算
  const { settlePaymentCallback } = await import("../payments/settlement.js");
  const outcome = await settlePaymentCallback(deps.db, config, "epay", result as never);
  if (!outcome.accepted && outcome.reason !== "duplicate_event") {
    throw new Error(`店铺订单结算未通过：${outcome.reason}`);
  }
}

// ─── 用户端：刷新店铺订单二维码 ──────────────────────────────────

const refreshShopQrCode: ActionHandler = async (input, context) => {
  const payment = paymentDeps(deps);
  const config = await runtimePaymentConfig(deps);
  if (!paymentReadiness(config).epay) throw new PublicError("支付暂未开启。", "EPAY_NOT_READY", 503);

  const orderNo = String(input.orderNo ?? "").trim();
  if (!orderNo) throw new PublicError("订单号不能为空。", "ORDER_NO_REQUIRED");

  const result = await deps.db.query<ShopOrderRow>(
    `SELECT order_no, status, product_name, package_id, price, buyer_email,
            payment_method, provider_trade_no, provider_status, qr_code, pay_url, qr_data_url,
            redemption_code, expires_at, paid_at, created_at
       FROM shop_orders WHERE order_no = $1`,
    [orderNo]
  );
  const order = result.rows[0];
  if (!order) throw new PublicError("订单不存在。", "ORDER_NOT_FOUND", 404);
  if (["paid", "fulfilled"].includes(order.status)) throw new PublicError("订单已支付。", "ORDER_ALREADY_PAID");
  if (["cancelled", "failed"].includes(order.status)) throw new PublicError("订单已关闭，请重新下单。", "ORDER_CLOSED");
  if (!orderRefreshable({ status: order.status, created_at: order.created_at })) throw new PublicError("刷新次数已达上限，请重新下单。", "ORDER_REFRESH_LIMIT");

  const epay = config.epay;
  const payType = epayPaymentType(order.payment_method);
  const subject = `QuizMate 兑换码 - ${order.product_name}`;
  const orderParams: NimanParams = {
    type: payType,
    out_trade_no: orderNo,
    notify_url: epay.notifyUrl,
    return_url: epay.returnUrl,
    name: subject,
    money: order.price,
    param: `shop:${orderNo}`,
    clientip: normalizeClientIp(context.clientIp)
  };

  let qrCode = "";
  let payUrl = "";
  let providerTradeNo = String(order.provider_trade_no ?? "");
  try {
    const parsed = await callNimanCreate(payment, buildEpayUrl(epay.apiUrl, "api/pay/create"), orderParams, epay, {
      maxAttempts: 8,
      unavailableMessage: "支付平台连接不稳定，已使用原二维码。"
    });
    qrCode = String(parsed.qrcode ?? parsed.pay_info ?? parsed.payurl ?? parsed.urlscheme ?? "");
    payUrl = String(parsed.pay_info ?? parsed.payurl ?? parsed.urlscheme ?? qrCode);
    providerTradeNo = String(parsed.trade_no ?? providerTradeNo);
  } catch {
    // 网络异常时走本地兜底
  }

  if (!qrCode) {
    qrCode = String(order.qr_code ?? "");
    payUrl = String(order.pay_url ?? qrCode);
  }
  if (!qrCode) throw new PublicError("无法获取二维码，请重新下单。", "EPAY_TARGET_MISSING", 502);

  const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 260 });
  await deps.db.query(
    `UPDATE shop_orders SET status = 'waiting', qr_code = $2, pay_url = $3, qr_data_url = $4,
        provider_trade_no = $5, expires_at = now() + interval '15 minutes', updated_at = now()
      WHERE order_no = $1`,
    [orderNo, qrCode, payUrl, qrDataUrl, providerTradeNo]
  );
  await deps.db.query(
    `UPDATE orders SET status = 'waiting', expires_at = now() + interval '15 minutes', updated_at = now()
      WHERE out_trade_no = $1`,
    [orderNo]
  );

  const pkg = CREDIT_PACKAGES.find((item) => item.id === order.package_id);
  return publicShopOrder({
    orderNo, status: "waiting", productName: order.product_name, price: order.price,
    method: payType === "wxpay" ? "wechat" : "alipay", qrDataUrl,
    totalCredits: pkg ? pkg.baseCredits + pkg.bonusCredits : 0,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
};

// ─── 管理端：批量生成兑换码 ──────────────────────────────────

const adminGenerateRedemptionCodes: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const packageId = String(input.packageId ?? "").trim();
  const pkg = creditPackageById(packageId);
  const count = Math.max(1, Math.min(500, Math.floor(Number(input.count ?? 1))));
  const batchId = `BATCH-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const note = String(input.note ?? "").trim().slice(0, 200);
  const expiresInDays = Number(input.expiresInDays ?? 0);
  const expiresAt = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
  const actor = input.accountToken ? "admin_token" : "admin_secret";

  const codes: string[] = [];
  const client = await deps.db.connect();
  try {
    for (let i = 0; i < count; i++) {
      let code = generateCode();
      // 确保唯一性
      let attempts = 0;
      while (attempts < 5) {
        const exists = await client.query("SELECT 1 FROM redemption_codes WHERE code = $1", [code]);
        if (!exists.rowCount) break;
        code = generateCode();
        attempts++;
      }
      await client.query(
        `INSERT INTO redemption_codes(code, package_id, package_name, base_credits, bonus_credits,
            total_credits, status, source, batch_id, created_by, note, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'unused', 'admin', $7, $8, NULLIF($9, ''), $10)`,
        [code, pkg.id, pkg.name, pkg.baseCredits, pkg.bonusCredits, pkg.baseCredits + pkg.bonusCredits,
         batchId, actor, note, expiresAt]
      );
      codes.push(code);
    }
  } finally {
    client.release();
  }

  return { batchId, count: codes.length, codes, packageName: pkg.name, totalCredits: pkg.baseCredits + pkg.bonusCredits };
};

// ─── 管理端：列出兑换码 ──────────────────────────────────

const adminListRedemptionCodes: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const { pageSize, requestedPage } = paging(input);
  const conditions: string[] = [];
  const params: unknown[] = [];

  const status = String(input.status ?? "").trim();
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }

  const batchId = String(input.batchId ?? "").trim();
  if (batchId) { params.push(`%${batchId}%`); conditions.push(`batch_id ILIKE $${params.length}`); }

  const code = String(input.code ?? "").trim();
  if (code) { params.push(`%${code}%`); conditions.push(`code ILIKE $${params.length}`); }

  const packageId = String(input.packageId ?? "").trim();
  if (packageId) { params.push(packageId); conditions.push(`package_id = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await deps.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM redemption_codes ${where}`, params);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  params.push(pageSize, (page - 1) * pageSize);
  const result = await deps.db.query<Record<string, unknown>>(
    `SELECT * FROM redemption_codes ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: result.rows.map((row) => ({
      codeId: Number(row.code_id), code: String(row.code ?? ""),
      packageId: String(row.package_id ?? ""), packageName: String(row.package_name ?? ""),
      baseCredits: Number(row.base_credits ?? 0), bonusCredits: Number(row.bonus_credits ?? 0),
      totalCredits: Number(row.total_credits ?? 0), status: String(row.status ?? ""),
      source: String(row.source ?? ""), batchId: String(row.batch_id ?? ""),
      shopOrderNo: String(row.shop_order_no ?? ""), redeemedBy: String(row.redeemed_by ?? ""),
      redeemedEmail: String(row.redeemed_email ?? ""), note: String(row.note ?? ""),
      createdAt: date(row.created_at), redeemedAt: date(row.redeemed_at), expiresAt: date(row.expires_at)
    })),
    page, pageSize, total, totalPages
  };
};

// ─── 管理端：禁用兑换码 ──────────────────────────────────

const adminDisableRedemptionCode: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const codeId = Number(input.codeId ?? 0);
  if (!codeId) throw new PublicError("请指定兑换码 ID。", "MISSING_CODE_ID");
  const reason = String(input.reason ?? "").trim().slice(0, 200);
  const client = await deps.db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ code_id: string; code: string; status: string }>(
      "UPDATE redemption_codes SET status = 'disabled', note = COALESCE(note, '') || CASE WHEN note IS NULL THEN '' ELSE ' | ' END || NULLIF($2, ''), updated_at = now() WHERE code_id = $1 AND status = 'unused' RETURNING code_id, code, status",
      [codeId, reason]
    );
    const disabled = result.rows[0];
    if (!disabled) throw new PublicError("兑换码不存在或状态不可禁用。", "CODE_NOT_DISABLEABLE", 404);
    await client.query("COMMIT");
    return { codeId: Number(disabled.code_id), code: disabled.code, disabled: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

// ─── 管理端：店铺商品管理 ──────────────────────────────────

const adminListShopProducts: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const result = await deps.db.query<Record<string, unknown>>(
    "SELECT * FROM shop_products ORDER BY sort_order ASC, product_id ASC"
  );
  return {
    items: result.rows.map((row) => ({
      productId: Number(row.product_id), name: String(row.name ?? ""),
      description: String(row.description ?? ""), packageId: String(row.package_id ?? ""),
      price: String(row.price ?? ""), status: String(row.status ?? ""),
      sortOrder: Number(row.sort_order ?? 0),
      createdAt: date(row.created_at), updatedAt: date(row.updated_at)
    }))
  };
};

const adminCreateShopProduct: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const name = String(input.name ?? "").trim();
  if (!name) throw new PublicError("请输入商品名称。", "NAME_REQUIRED");
  const packageId = String(input.packageId ?? "").trim();
  creditPackageById(packageId);
  const price = Number(input.price ?? 0).toFixed(2);
  if (Number(price) <= 0) throw new PublicError("价格必须大于 0。", "INVALID_PRICE");
  const description = String(input.description ?? "").trim().slice(0, 1000);
  const sortOrder = Math.max(0, Math.floor(Number(input.sortOrder ?? 0)));
  const result = await deps.db.query<{ product_id: string }>(
    `INSERT INTO shop_products(name, description, package_id, price, status, sort_order)
     VALUES ($1, $2, $3, $4, 'active', $5) RETURNING product_id`,
    [name, description, packageId, price, sortOrder]
  );
  return { productId: Number(result.rows[0]?.product_id ?? 0), created: true };
};

const adminUpdateShopProduct: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const productId = Number(input.productId ?? 0);
  if (!productId) throw new PublicError("请指定商品 ID。", "PRODUCT_ID_REQUIRED");
  const name = String(input.name ?? "").trim();
  const packageId = String(input.packageId ?? "").trim();
  if (packageId) creditPackageById(packageId);
  const price = input.price !== undefined ? Number(input.price).toFixed(2) : null;
  if (price !== null && Number(price) <= 0) throw new PublicError("价格必须大于 0。", "INVALID_PRICE");
  const description = input.description !== undefined ? String(input.description).trim().slice(0, 1000) : null;
  const status = input.status !== undefined ? String(input.status).trim() : null;
  if (status && !["active", "inactive"].includes(status)) throw new PublicError("状态必须为 active 或 inactive。", "INVALID_STATUS");
  const sortOrder = input.sortOrder !== undefined ? Math.max(0, Math.floor(Number(input.sortOrder))) : null;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (name) { params.push(name); sets.push(`name = $${params.length}`); }
  if (packageId) { params.push(packageId); sets.push(`package_id = $${params.length}`); }
  if (price !== null) { params.push(price); sets.push(`price = $${params.length}`); }
  if (description !== null) { params.push(description); sets.push(`description = $${params.length}`); }
  if (status) { params.push(status); sets.push(`status = $${params.length}`); }
  if (sortOrder !== null) { params.push(sortOrder); sets.push(`sort_order = $${params.length}`); }
  if (!sets.length) throw new PublicError("没有需要更新的字段。", "NO_UPDATES");
  sets.push("updated_at = now()");
  params.push(productId);
  const result = await deps.db.query(
    `UPDATE shop_products SET ${sets.join(", ")} WHERE product_id = $${params.length} RETURNING *`
  );
  if (!result.rowCount) throw new PublicError("商品不存在。", "PRODUCT_NOT_FOUND", 404);
  return { productId, updated: true };
};

const adminDeleteShopProduct: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const productId = Number(input.productId ?? 0);
  if (!productId) throw new PublicError("请指定商品 ID。", "PRODUCT_ID_REQUIRED");
  await deps.db.query("DELETE FROM shop_products WHERE product_id = $1", [productId]);
  return { productId, deleted: true };
};

// ─── 管理端：店铺订单列表 ──────────────────────────────────

const adminListShopOrders: ActionHandler = async (input) => {
  await authenticateAdmin(deps, input);
  const { pageSize, requestedPage } = paging(input);
  const conditions: string[] = [];
  const params: unknown[] = [];

  const status = String(input.status ?? "").trim();
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  const email = String(input.buyerEmail ?? input.email ?? "").trim().toLowerCase();
  if (email) { params.push(`%${email}%`); conditions.push(`buyer_email ILIKE $${params.length}`); }
  const orderNo = String(input.orderNo ?? "").trim();
  if (orderNo) { params.push(`%${orderNo}%`); conditions.push(`order_no ILIKE $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await deps.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM shop_orders ${where}`, params);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  params.push(pageSize, (page - 1) * pageSize);
  const result = await deps.db.query<Record<string, unknown>>(
    `SELECT * FROM shop_orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: result.rows.map((row) => ({
      orderId: Number(row.order_id), orderNo: String(row.order_no ?? ""),
      productName: String(row.product_name ?? ""), packageId: String(row.package_id ?? ""),
      price: String(row.price ?? ""), buyerEmail: String(row.buyer_email ?? ""),
      buyerName: String(row.buyer_name ?? ""), status: String(row.status ?? ""),
      paymentMethod: String(row.payment_method ?? ""), providerTradeNo: String(row.provider_trade_no ?? ""),
      redemptionCode: String(row.redemption_code ?? ""),
      createdAt: date(row.created_at), paidAt: date(row.paid_at), fulfilledAt: date(row.fulfilled_at),
      expiresAt: date(row.expires_at)
    })),
    page, pageSize, total, totalPages
  };
};

// ─── 导出：供 settlement.ts 调用的发码函数 ──────────────────────────────────

/**
 * 兑换码发码：在支付回调结算事务内调用，为 shop_credits 订单生成兑换码并更新 shop_orders。
 * 调用方需在同一个 PoolClient 事务中调用。
 */
export async function fulfillShopOrder(
  client: PoolClient,
  outTradeNo: string
): Promise<{ code: string; packageName: string; totalCredits: number; buyerEmail: string } | null> {
  // 从 orders 表获取套餐信息
  const orderResult = await client.query<{
    package_id: string; package_name: string; base_credits: string | number;
    bonus_credits: string | number; total_credits: string | number; email: string | null;
  }>(
    `SELECT package_id, package_name, base_credits, bonus_credits, total_credits, email
       FROM orders WHERE out_trade_no = $1 AND order_type = 'shop_credits'`,
    [outTradeNo]
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  // 检查是否已发过码（幂等）
  const existing = await client.query<{ code: string }>(
    "SELECT code FROM redemption_codes WHERE shop_order_no = $1",
    [outTradeNo]
  );
  if (existing.rows[0]) {
    // 已发过码，确保 shop_orders 状态一致
    await client.query(
      "UPDATE shop_orders SET status = 'fulfilled', redemption_code = $2, fulfilled_at = COALESCE(fulfilled_at, now()), updated_at = now() WHERE order_no = $1",
      [outTradeNo, existing.rows[0].code]
    );
    return {
      code: existing.rows[0].code,
      packageName: order.package_name,
      totalCredits: Number(order.total_credits),
      buyerEmail: order.email ?? ""
    };
  }

  // 生成唯一兑换码
  let code = generateCode();
  let attempts = 0;
  while (attempts < 10) {
    const dup = await client.query("SELECT 1 FROM redemption_codes WHERE code = $1", [code]);
    if (!dup.rowCount) break;
    code = generateCode();
    attempts++;
  }

  // 插入兑换码
  await client.query(
    `INSERT INTO redemption_codes(code, package_id, package_name, base_credits, bonus_credits,
        total_credits, status, source, shop_order_no)
     VALUES ($1, $2, $3, $4, $5, $6, 'unused', 'shop_order', $7)`,
    [code, order.package_id, order.package_name, order.base_credits, order.bonus_credits,
     order.total_credits, outTradeNo]
  );

  // 更新 shop_orders
  await client.query(
    "UPDATE shop_orders SET status = 'fulfilled', redemption_code = $2, paid_at = COALESCE(paid_at, now()), fulfilled_at = now(), updated_at = now() WHERE order_no = $1",
    [outTradeNo, code]
  );

  return {
    code,
    packageName: order.package_name,
    totalCredits: Number(order.total_credits),
    buyerEmail: order.email ?? ""
  };
}

// ─── 注册 actions ────────────────────────────────────────────

let deps: ActionDependencies;

export function createRedemptionCodeActions(dependencies: ActionDependencies): Map<string, ActionHandler> {
  deps = dependencies;
  return new Map([
    // 用户端
    ["redeemCode", redeemCode],
    ["listShopProducts", listShopProducts],
    ["createShopOrder", createShopOrder],
    ["queryShopOrder", queryShopOrder],
    ["refreshShopQrCode", refreshShopQrCode],
    // 管理端
    ["adminGenerateRedemptionCodes", adminGenerateRedemptionCodes],
    ["adminListRedemptionCodes", adminListRedemptionCodes],
    ["adminDisableRedemptionCode", adminDisableRedemptionCode],
    ["adminListShopProducts", adminListShopProducts],
    ["adminCreateShopProduct", adminCreateShopProduct],
    ["adminUpdateShopProduct", adminUpdateShopProduct],
    ["adminDeleteShopProduct", adminDeleteShopProduct],
    ["adminListShopOrders", adminListShopOrders],
  ]);
}
