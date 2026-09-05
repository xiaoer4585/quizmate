import { PublicError } from "../errors.js";
import { requireAdmin, requireAdminByToken } from "../services/admin.js";
import { createPasswordRecord, normalizeEmail } from "../security/crypto.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

function paging(input: ActionInput) {
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize ?? input.limit ?? 20))));
  const requestedPage = Math.max(1, Math.floor(Number(input.page ?? 1)));
  return { pageSize, requestedPage };
}

async function paged<T>(deps: ActionDependencies, input: ActionInput, table: string, order: string, columns: string, mapper: (row: T) => unknown) {
  const { pageSize, requestedPage } = paging(input);
  const countResult = await deps.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const result = await deps.db.query<T & Record<string, unknown>>(`SELECT ${columns} FROM ${table} ORDER BY ${order} DESC LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize]);
  return { items: result.rows.map(mapper), page, pageSize, total, totalPages };
}

function date(value: unknown): string {
  if (!value) return "";
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

const CREDIT_ACCOUNT_PLATFORMS = new Set([
  "win32-desktop",
  "darwin-desktop",
  "android",
  "browser-extension"
]);

function requestedCreditPlatform(input: ActionInput): string {
  const platform = String(input.platform ?? "").trim();
  if (platform && !CREDIT_ACCOUNT_PLATFORMS.has(platform)) {
    throw new PublicError("不支持的平台类型。", "INVALID_PLATFORM");
  }
  return platform;
}

function requestedCreditWhitelist(input: ActionInput): boolean {
  return input.excludeWhitelist === true
    || String(input.excludeWhitelist ?? "").trim().toLowerCase() === "true"
    || String(input.excludeWhitelist ?? "").trim() === "1";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildUnusedBonusCampaignEmail(creditAmount: number) {
  const subject = `QuizMate 全新升级，额外赠送你 ${creditAmount} 积分`;
  const textBody = [
    "你好，",
    "",
    "QuizMate 刚完成一次全新升级，已经修复偶发的截图问题，稳定性也更好了。",
    "",
    `同时，我们也想和你分享一个好消息：QuizMate 用户量已经累计突破 2000。为了感谢你的陪伴，这次额外送你 ${creditAmount} 积分，已经发放到你的账户里。`,
    "",
    "我们一直希望 QuizMate 不只是一个工具，而是能真正陪你拿到结果、斩获 offer 的伙伴。接下来我们还会继续把秋招场景做得更顺手、更高效。",
    "",
    "恭喜同学，你找到了打败秋招的“魔法”～",
    "",
    "主页传送门：https://quizmate.vip",
    "不切屏，不截屏。悬浮隐藏窗口字幕，支持双机位语音播报模式，结合简历 + JD 的 AI 辅助笔试面试。",
    "",
    "QuizMate 团队"
  ].join("\n");
  const htmlBody = [
    "<p>你好，</p>",
    "<p>QuizMate 刚完成一次全新升级，已经修复偶发的截图问题，稳定性也更好了。</p>",
    `<p>同时，我们也想和你分享一个好消息：QuizMate 用户量已经累计突破 2000。为了感谢你的陪伴，这次额外送你 <strong>${creditAmount} 积分</strong>，已经发放到你的账户里。</p>`,
    "<p>我们一直希望 QuizMate 不只是一个工具，而是能真正陪你拿到结果、斩获 offer 的伙伴。接下来我们还会继续把秋招场景做得更顺手、更高效。</p>",
    "<blockquote style=\"margin:16px 0;padding:14px 16px;border-left:4px solid #2563eb;background:#f8fbff\">",
    "<p style=\"margin:0 0 8px\">恭喜同学，你找到了打败秋招的“魔法”～</p>",
    "<p style=\"margin:0 0 8px\">主页传送门：https://quizmate.vip</p>",
    "<p style=\"margin:0\">不切屏，不截屏。悬浮隐藏窗口字幕，支持双机位语音播报模式，结合简历 + JD 的 AI 辅助笔试面试。</p>",
    "</blockquote>",
    "<p>QuizMate 团队</p>"
  ].join("");
  return { subject, textBody, htmlBody };
}

async function loadUnusedBonusRecipients(client: ActionDependencies["db"]) {
  const result = await client.query<{
    account_id: string;
    email: string;
    credits: string | number;
    total_charged_credits: string | number;
    total_consumed_credits: string | number;
    register_bonus_credits: string | number;
  }>(
    `SELECT a.account_id, a.email, c.credits, c.total_charged_credits, c.total_consumed_credits, a.register_bonus_credits
       FROM accounts a
       JOIN credit_accounts c USING(account_id)
      WHERE a.status = 'active'
        AND a.role = 'user'
        AND a.register_bonus_credits = 50
        AND c.total_charged_credits = 50
        AND c.total_consumed_credits = 0
        AND c.credits = 50
      ORDER BY a.created_at ASC`
  );
  return result.rows.map((row) => ({
    accountId: String(row.account_id),
    email: String(row.email),
    credits: Number(row.credits),
    totalChargedCredits: Number(row.total_charged_credits),
    totalConsumedCredits: Number(row.total_consumed_credits),
    registerBonusCredits: Number(row.register_bonus_credits)
  }));
}

export async function authenticateAdmin(deps: ActionDependencies, input: ActionInput): Promise<{ accountId: string; email: string }> {
  // 优先使用账户 token 认证
  if (input.accountToken || input.token) {
    const client = await deps.db.connect();
    try {
      return await requireAdminByToken(client, input.accountToken || input.token);
    } finally {
      client.release();
    }
  }
  // 兼容旧的 adminSecret 认证
  requireAdmin(deps.adminSecret, input.adminSecret);
  return { accountId: "admin_secret", email: "" };
}

export function createAdminActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();
  actions.set("adminListDevices", async (input) => {
    await authenticateAdmin(deps, input);
    return paged<Record<string, unknown>>(deps, input, "devices", "last_seen_at", "*", (row) => ({
      licenseCode: String(row.legacy_license_code ?? ""), deviceId: String(row.device_id ?? ""),
      lastSeenAt: date(row.last_seen_at), createdAt: date(row.first_seen_at), updatedAt: date(row.last_seen_at)
    }));
  });
  actions.set("adminListOrders", async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    // 订单筛选条件：状态、订单类型、支付通道、邮箱、订单号、创建时间区间
    const conditions: string[] = [];
    const params: unknown[] = [];
    const addLike = (column: string, value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text) return;
      params.push(`%${text}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };
    const addEqual = (column: string, value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text) return;
      params.push(text);
      conditions.push(`${column} = $${params.length}`);
    };
    const addDateRange = (column: string, start: unknown, end: unknown) => {
      const startDate = String(start ?? "").trim();
      const endDate = String(end ?? "").trim();
      if (startDate) { params.push(`${startDate}T00:00:00+08:00`); conditions.push(`${column} >= $${params.length}`); }
      if (endDate) { params.push(`${endDate}T23:59:59+08:00`); conditions.push(`${column} <= $${params.length}`); }
    };
    addEqual("status", input.status);
    addEqual("order_type", input.orderType);
    addEqual("provider", input.provider);
    addLike("email", input.email);
    addLike("out_trade_no", input.outTradeNo);
    addDateRange("created_at", input.startDate, input.endDate);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await deps.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM orders ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      items: result.rows.map((row) => ({
        outTradeNo: String(row.out_trade_no ?? ""), status: String(row.status ?? ""), provider: String(row.provider ?? "alipay"),
        orderType: String(row.order_type ?? "license"), fulfillmentMode: String(row.fulfillment_mode ?? "bind_device"),
        packageId: String(row.package_id ?? ""), totalCredits: Number(row.total_credits ?? 0), accountId: String(row.account_id ?? ""), email: String(row.email ?? ""),
        days: Number(row.days ?? 0), amount: String(row.amount ?? ""), licenseCode: String(row.legacy_license_code ?? ""), deviceId: String(row.device_id ?? ""),
        alipayTradeNo: String(row.provider === "alipay" ? row.provider_trade_no ?? "" : ""), tradeStatus: String(row.provider_status ?? ""),
        payjsOrderId: String(row.provider === "payjs" || row.provider === "wechat" ? row.provider_trade_no ?? "" : ""),
        epayTradeNo: String(row.provider === "epay" ? row.provider_trade_no ?? "" : ""), creditBalanceAfter: Number(row.credit_balance_after ?? 0),
        creditedAt: date(row.credited_at), createdAt: date(row.created_at), paidAt: date(row.paid_at), updatedAt: date(row.updated_at), error: String(row.error_message ?? "")
      })),
      page, pageSize, total, totalPages
    };
  });
  const listCreditAccounts: ActionHandler = async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    const emailKeyword = String(input.email ?? "").trim().slice(0, 200);
    const platform = requestedCreditPlatform(input);
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (emailKeyword) {
      params.push(`%${emailKeyword.toLowerCase()}%`);
      conditions.push(`lower(a.email) LIKE $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`latest.platform = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const latestPlatformJoin = `LEFT JOIN LATERAL (
         SELECT CASE
           WHEN s.platform IN ('win32', 'win32-desktop') THEN 'win32-desktop'
           WHEN s.platform IN ('darwin', 'darwin-desktop') THEN 'darwin-desktop'
           WHEN s.platform IN ('android', 'android-app') THEN 'android'
           WHEN s.platform IN ('browser', 'website', 'browser-extension') THEN 'browser-extension'
           ELSE s.platform
         END AS platform FROM account_sessions s
          WHERE s.account_id = a.account_id AND s.platform IS NOT NULL
          ORDER BY s.last_seen_at DESC NULLS LAST, s.created_at DESC LIMIT 1
       ) latest ON true`;
    const totalParams = params.length;
    const total = Number((await deps.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM accounts a JOIN credit_accounts c USING(account_id)
       ${latestPlatformJoin} ${whereClause}`,
      params
    )).rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const limitParam = `$${totalParams + 1}`;
    const offsetParam = `$${totalParams + 2}`;
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT a.*, c.credits, c.total_charged_credits, c.total_consumed_credits,
              latest.platform AS session_platform
       FROM accounts a JOIN credit_accounts c USING(account_id)
       ${latestPlatformJoin} ${whereClause}
       ORDER BY a.created_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return { items: result.rows.map((row) => ({ accountId: String(row.account_id), email: String(row.email), credits: Number(row.credits), totalChargedCredits: Number(row.total_charged_credits), totalConsumedCredits: Number(row.total_consumed_credits), registerBonusCredits: Number(row.register_bonus_credits), platform: String(row.session_platform ?? ""), status: String(row.status), role: String(row.role ?? "user"), createdAt: date(row.created_at), lastLoginAt: date(row.last_login_at), updatedAt: date(row.updated_at), type: "credits" })), page, pageSize, total, totalPages };
  };
  actions.set("adminListCreditAccounts", listCreditAccounts);
  actions.set("adminListAccounts", listCreditAccounts);
  actions.set("adminListCreditUsers", listCreditAccounts);

  const listCreditLogs: ActionHandler = async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    const emailKeyword = String(input.email ?? "").trim().slice(0, 200);
    const platform = requestedCreditPlatform(input);
    const excludeWhitelist = requestedCreditWhitelist(input);
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (emailKeyword) {
      params.push(`%${emailKeyword.toLowerCase()}%`);
      conditions.push(`lower(a.email) LIKE $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`latest.platform = $${params.length}`);
    }
    if (excludeWhitelist) {
      conditions.push(`lower(a.email) NOT IN (SELECT email FROM credit_log_whitelist)`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const latestPlatformJoin = `LEFT JOIN LATERAL (
         SELECT CASE
           WHEN s.platform IN ('win32', 'win32-desktop') THEN 'win32-desktop'
           WHEN s.platform IN ('darwin', 'darwin-desktop') THEN 'darwin-desktop'
           WHEN s.platform IN ('android', 'android-app') THEN 'android'
           WHEN s.platform IN ('browser', 'website', 'browser-extension') THEN 'browser-extension'
           ELSE s.platform
         END AS platform FROM account_sessions s
          WHERE s.account_id = a.account_id AND s.platform IS NOT NULL
          ORDER BY s.last_seen_at DESC NULLS LAST, s.created_at DESC LIMIT 1
       ) latest ON true`;
    const total = Number((await deps.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM credit_ledger l JOIN accounts a USING(account_id)
       ${latestPlatformJoin} ${whereClause}`,
      params
    )).rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    params.push(pageSize, (page - 1) * pageSize);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT l.*, a.email, latest.platform AS session_platform
         FROM credit_ledger l JOIN accounts a USING(account_id)
         ${latestPlatformJoin} ${whereClause}
        ORDER BY l.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items: result.rows.map((row) => ({
      logId: String(row.log_id ?? ""), accountId: String(row.account_id ?? ""), email: String(row.email ?? ""), type: String(row.operation_type ?? ""),
      credits: Number(row.credits ?? 0), balanceAfter: Number(row.balance_after ?? 0), source: String(row.source ?? ""), orderNo: String(row.order_no ?? ""),
      packageId: String(row.package_id ?? ""), platform: String(row.session_platform ?? ""), deviceId: String(row.device_id ?? ""), requestId: String(row.request_id ?? ""), createdAt: date(row.created_at)
    })), page, pageSize, total, totalPages };
  };
  actions.set("adminListCreditLogs", listCreditLogs);
  actions.set("adminListCreditLedger", listCreditLogs);
  actions.set("adminListCreditFlow", listCreditLogs);
  actions.set("adminListCreditFlows", listCreditLogs);
  actions.set("adminGetCreditWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const result = await deps.db.query<{ email: string; note: string | null; created_at: string | Date }>(
      `SELECT email, note, created_at FROM credit_log_whitelist ORDER BY created_at DESC, email ASC`
    );
    return {
      items: result.rows.map((row) => ({
        email: String(row.email ?? ""),
        note: String(row.note ?? ""),
        createdAt: date(row.created_at)
      }))
    };
  });
  actions.set("adminAddCreditWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
    const note = String(input.note ?? "").trim().slice(0, 200);
    await deps.db.query(
      `INSERT INTO credit_log_whitelist(email, note, created_at)
       VALUES ($1, NULLIF($2, ''), now())
       ON CONFLICT(email) DO UPDATE SET note = EXCLUDED.note`,
      [email, note]
    );
    return { added: true, email, note };
  });
  actions.set("adminRemoveCreditWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
    const result = await deps.db.query<{ email: string }>(
      `DELETE FROM credit_log_whitelist WHERE email = $1 RETURNING email`,
      [email]
    );
    if (!result.rows[0]) throw new PublicError("白名单邮箱不存在。", "WHITELIST_EMAIL_NOT_FOUND", 404);
    return { removed: true, email };
  });
  actions.set("adminDashboardSummary", async (input) => {
    await authenticateAdmin(deps, input);
    const result = await deps.db.query<{
      license_count: string; active_license_count: string; account_count: string; credits: string;
      paid_credit_orders: string; waiting_orders: string; credit_logs: string; website_visits: string;
    }>(`SELECT
      (SELECT count(*) FROM legacy_licenses)::text AS license_count,
      (SELECT count(*) FROM legacy_licenses WHERE status = 'active')::text AS active_license_count,
      (SELECT count(*) FROM accounts)::text AS account_count,
      (SELECT COALESCE(sum(credits),0) FROM credit_accounts)::text AS credits,
      (SELECT count(*) FROM orders WHERE order_type = 'credits' AND status = 'paid')::text AS paid_credit_orders,
      (SELECT count(*) FROM orders WHERE status = 'waiting')::text AS waiting_orders,
      (SELECT count(*) FROM credit_ledger)::text AS credit_logs,
      (SELECT count(*) FROM website_visit_logs WHERE client_ip NOT IN (SELECT client_ip FROM visit_whitelist))::text AS website_visits`);
    const row = result.rows[0]!;
    return { licenseCount: Number(row.license_count), activeLicenseCount: Number(row.active_license_count), accountCount: Number(row.account_count), totalCreditsBalance: Number(row.credits), paidCreditOrderCount: Number(row.paid_credit_orders), waitingOrderCount: Number(row.waiting_orders), creditLogCount: Number(row.credit_logs), websiteVisitCount: Number(row.website_visits) };
  });
  actions.set("adminQueryRdb", async (input) => {
    await authenticateAdmin(deps, input);
    const table = String(input.table ?? "").trim();
    const allowed = String(process.env.RDB_ALLOWED_TABLES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(table) || !allowed.includes(table)) throw new PublicError("该关系型数据库表未加入 RDB_ALLOWED_TABLES 白名单。", "RDB_TABLE_DENIED", 403);
    const limit = Math.max(1, Math.min(10, Math.floor(Number(input.limit ?? 10))));
    const result = await deps.db.query<Record<string, unknown>>(`SELECT * FROM ${table} LIMIT $1`, [limit]);
    return { table, count: result.rows.length, items: result.rows };
  });
  actions.set("adminAdjustCredits", async (input) => {
    await authenticateAdmin(deps, input);
    const accountId = String(input.accountId ?? "").trim();
    if (!accountId) throw new PublicError("请指定要调整的账户。", "MISSING_ACCOUNT");
    const operation = String(input.operation ?? "").trim();
    if (operation !== "add" && operation !== "subtract") {
      throw new PublicError("操作类型必须为 add 或 subtract。", "INVALID_OPERATION");
    }
    const credits = Math.floor(Number(input.credits ?? 0));
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new PublicError("积分数量必须是大于 0 的整数。", "INVALID_CREDITS");
    }
    const reason = String(input.reason ?? "").trim().slice(0, 200);
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const accountResult = await client.query<{
        account_id: string; email: string;
        credits: string | number; total_charged_credits: string | number; total_consumed_credits: string | number;
      }>(
        `SELECT a.account_id, a.email, c.credits, c.total_charged_credits, c.total_consumed_credits
           FROM accounts a JOIN credit_accounts c USING(account_id)
          WHERE a.account_id = $1 FOR UPDATE OF a, c`,
        [accountId]
      );
      const account = accountResult.rows[0];
      if (!account) throw new PublicError("账户不存在。", "ACCOUNT_NOT_FOUND", 404);
      const current = Number(account.credits);
      const delta = operation === "add" ? credits : -credits;
      const next = current + delta;
      if (next < 0) {
        throw new PublicError(`积分余额不足。当前余额 ${current}，无法减少 ${credits} 积分。`, "INSUFFICIENT_CREDITS", 402);
      }
      const updateResult = await client.query<{
        credits: string | number; total_charged_credits: string | number; total_consumed_credits: string | number;
      }>(
        `UPDATE credit_accounts
            SET credits = $2,
                total_charged_credits = total_charged_credits + CASE WHEN $3 = 'add' THEN $4 ELSE 0 END,
                total_consumed_credits = total_consumed_credits + CASE WHEN $3 = 'subtract' THEN $4 ELSE 0 END,
                updated_at = now()
          WHERE account_id = $1
          RETURNING credits, total_charged_credits, total_consumed_credits`,
        [accountId, next, operation, credits]
      );
      const updated = updateResult.rows[0]!;
      const ledgerResult = await client.query<{ log_id: string }>(
        `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, reason)
         VALUES ($1, 'admin_adjust', $2, $3, 'admin_panel', NULLIF($4, ''))
         RETURNING log_id`,
        [accountId, delta, Number(updated.credits), reason]
      );
      await client.query("COMMIT");
      return {
        account: {
          accountId: String(account.account_id),
          email: String(account.email),
          credits: Number(updated.credits),
          totalChargedCredits: Number(updated.total_charged_credits),
          totalConsumedCredits: Number(updated.total_consumed_credits)
        },
        operation,
        adjustedCredits: credits,
        logId: String(ledgerResult.rows[0]?.log_id ?? "")
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  actions.set("adminBatchAdjustCredits", async (input) => {
    await authenticateAdmin(deps, input);
    const operation = String(input.operation ?? "").trim();
    if (operation !== "add" && operation !== "subtract") {
      throw new PublicError("操作类型必须为 add 或 subtract。", "INVALID_OPERATION");
    }
    const credits = Math.floor(Number(input.credits ?? 0));
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new PublicError("积分数量必须是大于 0 的整数。", "INVALID_CREDITS");
    }
    const reason = String(input.reason ?? "").trim().slice(0, 200);
    const rawEmails = Array.isArray(input.emails) ? input.emails : [];
    const emails = Array.from(new Set(rawEmails
      .map((value) => normalizeEmail(value))
      .filter(Boolean)));
    if (!emails.length) throw new PublicError("请至少输入一个有效的用户邮箱。", "MISSING_EMAILS");
    if (emails.length > 500) throw new PublicError("单次最多批量调整 500 个用户。", "TOO_MANY_EMAILS");
    const client = await deps.db.connect();
    const results: { email: string; status: "ok" | "skipped"; reason?: string; credits?: number }[] = [];
    const summary = { total: emails.length, success: 0, skipped: 0 };
    try {
      await client.query("BEGIN");
      for (const email of emails) {
        const accountResult = await client.query<{
          account_id: string; email: string; credits: string | number;
        }>(
          `SELECT a.account_id, a.email, c.credits
             FROM accounts a JOIN credit_accounts c USING(account_id)
            WHERE a.email = $1 FOR UPDATE OF a, c`,
          [email]
        );
        const account = accountResult.rows[0];
        if (!account) {
          results.push({ email, status: "skipped", reason: "账户不存在" });
          summary.skipped += 1;
          continue;
        }
        const current = Number(account.credits);
        const delta = operation === "add" ? credits : -credits;
        const next = current + delta;
        if (next < 0) {
          results.push({ email, status: "skipped", reason: `余额不足（当前 ${current}）`, credits: current });
          summary.skipped += 1;
          continue;
        }
        const updateResult = await client.query<{ credits: string | number }>(
          `UPDATE credit_accounts
              SET credits = $2,
                  total_charged_credits = total_charged_credits + CASE WHEN $3 = 'add' THEN $4 ELSE 0 END,
                  total_consumed_credits = total_consumed_credits + CASE WHEN $3 = 'subtract' THEN $4 ELSE 0 END,
                  updated_at = now()
            WHERE account_id = $1
            RETURNING credits`,
          [account.account_id, next, operation, credits]
        );
        const updated = updateResult.rows[0]!;
        await client.query(
          `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, reason)
           VALUES ($1, 'admin_adjust', $2, $3, 'admin_panel_batch', NULLIF($4, ''))`,
          [account.account_id, delta, Number(updated.credits), reason]
        );
        results.push({ email, status: "ok", credits: Number(updated.credits) });
        summary.success += 1;
      }
      await client.query(
        `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
         VALUES ($1, 'batch_adjust_credits', 'credit_accounts', $2, $3)`,
        [
          input.accountToken ? "admin" : "admin_secret",
          emails.join(","),
          `批量${operation === "add" ? "增加" : "减少"}积分：数量=${credits} 成功=${summary.success} 跳过=${summary.skipped} 备注=${reason || "-"}`
        ]
      );
      await client.query("COMMIT");
      return { operation, credits, reason, summary, results };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  actions.set("adminBroadcastEmail", async (input) => {
    const admin = await authenticateAdmin(deps, input);
    const segment = String(input.segment ?? input.campaign ?? "").trim();
    const grantCredits = Math.max(0, Math.floor(Number(input.grantCredits ?? 50)));
    const customSubject = String(input.subject ?? "").trim();
    const customTextBody = String(input.textBody ?? "").trim();
    const customHtmlBody = String(input.htmlBody ?? "").trim();
    if (segment === "unused_bonus_50" && grantCredits <= 0) {
      throw new PublicError("赠送积分必须大于 0。", "INVALID_CREDITS");
    }

    const manualRecipients = Array.isArray(input.emails)
      ? Array.from(new Set(input.emails.map((value) => normalizeEmail(value)).filter(Boolean)))
      : [];
    const campaignRecipients = segment === "unused_bonus_50" ? await loadUnusedBonusRecipients(deps.db) : [];
    const recipients = segment === "unused_bonus_50"
      ? campaignRecipients.map((row) => row.email)
      : manualRecipients;

    if (!recipients.length) {
      throw new PublicError("请提供收件人或目标分组。", "MISSING_RECIPIENTS");
    }
    if (!deps.sendNotification) {
      throw new PublicError("邮件服务尚未配置。", "SMTP_NOT_CONFIGURED", 503);
    }

    let grantedCount = 0;
    if (segment === "unused_bonus_50") {
      if (!campaignRecipients.length) throw new PublicError("没有找到符合条件的用户。", "NO_RECIPIENTS", 404);
      const client = await deps.db.connect();
      try {
        await client.query("BEGIN");
        for (const recipient of campaignRecipients) {
          const updateResult = await client.query<{ credits: string | number; total_charged_credits: string | number }>(
            `UPDATE credit_accounts
                SET credits = credits + $2,
                    total_charged_credits = total_charged_credits + $2,
                    updated_at = now()
              WHERE account_id = $1
              RETURNING credits, total_charged_credits`,
            [recipient.accountId, grantCredits]
          );
          const updated = updateResult.rows[0];
          if (!updated) throw new PublicError("用户积分账户不存在。", "CREDIT_ACCOUNT_NOT_FOUND", 409);
          await client.query(
            `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, reason)
             VALUES ($1, 'admin_adjust', $2, $3, 'campaign_bonus', NULLIF($4, ''))`,
            [recipient.accountId, grantCredits, Number(updated.credits), "注册未使用用户活动赠送 50 积分"]
          );
          grantedCount += 1;
        }
        await client.query(
          `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
           VALUES ($1, 'broadcast_email', 'credit_accounts', $2, $3)`,
          [
            admin.accountId,
            `unused_bonus_50:${grantedCount}`,
            `活动群发：未使用注册赠送用户=${grantedCount} 赠送积分=${grantCredits}`
          ]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const template = segment === "unused_bonus_50"
      ? buildUnusedBonusCampaignEmail(grantCredits)
      : {
          subject: customSubject || "QuizMate 通知",
          textBody: customTextBody || "你好，",
          htmlBody: customHtmlBody || "<p>你好，</p>"
        };
    const sendResults: { email: string; status: "sent" | "failed"; error?: string }[] = [];
    for (const email of recipients) {
      try {
        await deps.sendNotification(email, template.subject, template.textBody, template.htmlBody);
        sendResults.push({ email, status: "sent" });
      } catch (error) {
        sendResults.push({ email, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      segment: segment || "manual",
      subject: template.subject,
      recipientCount: recipients.length,
      grantedCount,
      sentCount: sendResults.filter((item) => item.status === "sent").length,
      failedCount: sendResults.filter((item) => item.status === "failed").length,
      results: sendResults
    };
  });
  actions.set("adminSetAccountRole", async (input) => {
    await authenticateAdmin(deps, input);
    const accountId = String(input.accountId ?? "").trim();
    const email = String(input.email ?? "").trim();
    if (!accountId && !email) throw new PublicError("请指定账户 ID 或邮箱。", "MISSING_ACCOUNT_ID");
    const role = String(input.role ?? "").trim();
    if (role !== "user" && role !== "admin") {
      throw new PublicError("角色必须为 user 或 admin。", "INVALID_ROLE");
    }
    const client = await deps.db.connect();
    try {
      const result = await client.query<{ account_id: string; email: string; role: string }>(
        `UPDATE accounts SET role = $1, updated_at = now()
         WHERE account_id = $2 OR email = $3
         RETURNING account_id, email, role`,
        [role, accountId, email]
      );
      const account = result.rows[0];
      if (!account) throw new PublicError("账户不存在。", "ACCOUNT_NOT_FOUND", 404);
      return { accountId: String(account.account_id), email: String(account.email), role: String(account.role) };
    } finally {
      client.release();
    }
  });
  actions.set("initAdminRole", async (input) => {
    const email = String(input.email ?? "").trim();
    const role = String(input.role ?? "").trim();
    if (!email) throw new PublicError("请指定邮箱。", "MISSING_EMAIL");
    if (role !== "user" && role !== "admin") {
      throw new PublicError("角色必须为 user 或 admin。", "INVALID_ROLE");
    }
    const client = await deps.db.connect();
    try {
      const result = await client.query<{ account_id: string; email: string; role: string }>(
        `UPDATE accounts SET role = $1, updated_at = now()
         WHERE email = $2
         RETURNING account_id, email, role`,
        [role, email]
      );
      const account = result.rows[0];
      if (!account) throw new PublicError("账户不存在。", "ACCOUNT_NOT_FOUND", 404);
      return { accountId: String(account.account_id), email: String(account.email), role: String(account.role) };
    } finally {
      client.release();
    }
  });
  actions.set("adminDeleteCreditLog", async (input) => {
    await authenticateAdmin(deps, input);
    const logId = String(input.logId ?? "").trim();
    if (!logId) throw new PublicError("请指定要删除的积分流水 ID。", "MISSING_LOG_ID");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ log_id: string; account_id: string; operation_type: string; credits: string | number }>(
        "DELETE FROM credit_ledger WHERE log_id = $1 RETURNING log_id, account_id, operation_type, credits",
        [logId]
      );
      const deleted = result.rows[0];
      if (!deleted) throw new PublicError("积分流水不存在或已被删除。", "LOG_NOT_FOUND", 404);
      await client.query(
        "INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'delete_credit_log', 'credit_ledger', $2, $3)",
        [input.accountToken ? "admin" : "admin_secret", String(deleted.log_id), `删除积分流水：账户=${deleted.account_id} 类型=${deleted.operation_type} 变化=${deleted.credits}`]
      );
      await client.query("COMMIT");
      return { logId: String(deleted.log_id), deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  actions.set("adminDeleteOrder", async (input) => {
    await authenticateAdmin(deps, input);
    const outTradeNo = String(input.outTradeNo ?? "").trim();
    if (!outTradeNo) throw new PublicError("请指定要删除的订单号。", "MISSING_ORDER_NO");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      // 先删除关联的 payment_events（外键 ON DELETE RESTRICT）
      await client.query("DELETE FROM payment_events WHERE out_trade_no = $1", [outTradeNo]);
      const result = await client.query<{ order_id: string; out_trade_no: string; status: string; order_type: string; email: string | null }>(
        "DELETE FROM orders WHERE out_trade_no = $1 RETURNING order_id, out_trade_no, status, order_type, email",
        [outTradeNo]
      );
      const deleted = result.rows[0];
      if (!deleted) throw new PublicError("订单不存在或已被删除。", "ORDER_NOT_FOUND", 404);
      await client.query(
        "INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'delete_order', 'orders', $2, $3)",
        [input.accountToken ? "admin" : "admin_secret", String(deleted.order_id), `删除订单：订单号=${deleted.out_trade_no} 状态=${deleted.status} 类型=${deleted.order_type} 邮箱=${deleted.email ?? ""}`]
      );
      await client.query("COMMIT");
      return { outTradeNo: String(deleted.out_trade_no), orderId: String(deleted.order_id), deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  actions.set("adminListModelCallFailures", async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const addEqual = (column: string, value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text) return;
      params.push(text);
      conditions.push(`${column} = $${params.length}`);
    };
    const addDateRange = (column: string, start: unknown, end: unknown) => {
      const startDate = String(start ?? "").trim();
      const endDate = String(end ?? "").trim();
      if (startDate) { params.push(`${startDate}T00:00:00+08:00`); conditions.push(`${column} >= $${params.length}`); }
      if (endDate) { params.push(`${endDate}T23:59:59+08:00`); conditions.push(`${column} <= $${params.length}`); }
    };
    addEqual("model_type", input.modelType);
    addEqual("error_code", input.errorCode);
    addEqual("request_mode", input.requestMode);
    if (input.excludeWhitelist === true || String(input.excludeWhitelist ?? "").trim().toLowerCase() === "true" || String(input.excludeWhitelist ?? "").trim() === "1") {
      conditions.push("(account_email IS NULL OR lower(account_email) NOT IN (SELECT email FROM model_failure_whitelist))");
    }
    addDateRange("created_at", input.startDate, input.endDate);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = Number((await deps.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM model_call_failures ${where}`, params
    )).rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    params.push(pageSize, (page - 1) * pageSize);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT * FROM model_call_failures ${where} ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const items = result.rows.map((row) => ({
      failureId: Number(row.failure_id),
      modelType: String(row.model_type ?? ""),
      modelName: String(row.model_name ?? ""),
      errorCode: String(row.error_code ?? ""),
      errorMessage: String(row.error_message ?? ""),
      httpStatus: row.http_status == null ? null : Number(row.http_status),
      requestMode: String(row.request_mode ?? ""),
      accountId: String(row.account_id ?? ""),
      accountEmail: String(row.account_email ?? ""),
      requestId: String(row.request_id ?? ""),
      clientIp: String(row.client_ip ?? ""),
      createdAt: date(row.created_at)
    }));
    // 同时返回可用错误码与请求模式列表（仅字符串数组，用于后台筛选下拉）
    const codes = (await deps.db.query<{ error_code: string }>(
      `SELECT error_code FROM model_call_failures GROUP BY error_code ORDER BY count(*) DESC LIMIT 30`
    )).rows.map((r) => String(r.error_code));
    const modes = (await deps.db.query<{ request_mode: string }>(
      `SELECT COALESCE(NULLIF(request_mode, ''), 'unknown') AS request_mode FROM model_call_failures
       GROUP BY request_mode ORDER BY count(*) DESC LIMIT 20`
    )).rows.map((r) => String(r.request_mode));
    return { items, page, pageSize, total, totalPages, errorCodes: codes, requestModes: modes };
  });
  actions.set("adminGetModelFailureWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const result = await deps.db.query<{ email: string; note: string | null; created_at: string | Date }>(
      `SELECT email, note, created_at FROM model_failure_whitelist ORDER BY created_at DESC, email ASC`
    );
    return { items: result.rows.map((row) => ({ email: String(row.email ?? ""), note: String(row.note ?? ""), createdAt: date(row.created_at) })) };
  });
  actions.set("adminAddModelFailureWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
    const note = String(input.note ?? "").trim().slice(0, 200);
    await deps.db.query(
      `INSERT INTO model_failure_whitelist(email, note, created_at) VALUES ($1, NULLIF($2, ''), now())
       ON CONFLICT(email) DO UPDATE SET note = EXCLUDED.note`,
      [email, note]
    );
    return { added: true, email, note };
  });
  actions.set("adminRemoveModelFailureWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
    const result = await deps.db.query<{ email: string }>(`DELETE FROM model_failure_whitelist WHERE email = $1 RETURNING email`, [email]);
    if (!result.rows[0]) throw new PublicError("白名单邮箱不存在。", "WHITELIST_EMAIL_NOT_FOUND", 404);
    return { removed: true, email };
  });
  actions.set("adminDeleteModelCallFailures", async (input) => {
    await authenticateAdmin(deps, input);
    const ids = Array.from(new Set((Array.isArray(input.failureIds) ? input.failureIds : []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))).slice(0, 100);
    if (!ids.length) throw new PublicError("请至少选择一条 AI 失败记录。", "MISSING_FAILURE_IDS");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ failure_id: number }>(
        "DELETE FROM model_call_failures WHERE failure_id = ANY($1::bigint[]) RETURNING failure_id",
        [ids]
      );
      await client.query(
        "INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'delete_model_call_failures', 'model_call_failures', $2, $3)",
        [input.accountToken ? "admin" : "admin_secret", ids.join(","), `删除 AI 调用失败记录：请求 ${ids.length} 条，实际 ${result.rows.length} 条`]
      );
      await client.query("COMMIT");
      return { deleted: result.rows.length, failureIds: result.rows.map((row) => Number(row.failure_id)) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  actions.set("adminResumeFieldObservations", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = String(input.hostname ?? "").trim();
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT hostname, signature, label, control_type, source_path,
              success_count, failure_count, option_stats, last_reason, updated_at
         FROM resume_page_rules
        WHERE ($1 = '' OR hostname ILIKE $2)
        ORDER BY (success_count + failure_count) DESC, updated_at DESC
        LIMIT 300`,
      [hostname, `%${hostname}%`]
    );
    return {
      items: result.rows.map((row) => ({
        hostname: String(row.hostname ?? ""), signature: String(row.signature ?? ""),
        label: String(row.label ?? ""), controlType: String(row.control_type ?? "text"),
        sourcePath: String(row.source_path ?? ""), successCount: Number(row.success_count ?? 0),
        failureCount: Number(row.failure_count ?? 0), optionStats: row.option_stats || [],
        lastReason: String(row.last_reason ?? ""), updatedAt: date(row.updated_at)
      }))
    };
  });
  actions.set("adminResetAdminCredentials", async (input) => {
    await authenticateAdmin(deps, input);
    const newEmail = normalizeEmail(input.newEmail);
    const newPassword = String(input.newPassword ?? "").trim();
    if (!newEmail) throw new PublicError("请输入有效的邮箱地址。", "INVALID_EMAIL");
    if (newPassword.length < 8) throw new PublicError("密码长度至少 8 位。", "INVALID_PASSWORD");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      // 查找当前管理员账户（role=admin）
      const adminResult = await client.query<{ account_id: string; email: string }>(
        "SELECT account_id, email FROM accounts WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1 FOR UPDATE"
      );
      const admin = adminResult.rows[0];
      if (!admin) throw new PublicError("未找到管理员账户。", "ADMIN_NOT_FOUND", 404);
      // 如果新邮箱与当前邮箱不同，检查是否已被其他账户占用
      if (admin.email !== newEmail) {
        const conflictResult = await client.query<{ account_id: string }>(
          "SELECT account_id FROM accounts WHERE email = $1 AND account_id != $2",
          [newEmail, admin.account_id]
        );
        if (conflictResult.rows[0]) throw new PublicError("该邮箱已被其他账户占用。", "EMAIL_CONFLICT", 409);
      }
      // 更新邮箱和密码
      const { passwordSalt, passwordHash } = createPasswordRecord(newPassword);
      const updateResult = await client.query<{ account_id: string; email: string }>(
        `UPDATE accounts
            SET email = $1, password_salt = $2, password_hash = $3, updated_at = now()
          WHERE account_id = $4
         RETURNING account_id, email`,
        [newEmail, passwordSalt, passwordHash, admin.account_id]
      );
      const updated = updateResult.rows[0]!;
      // 吊销该账户所有现有 session，强制重新登录
      await client.query(
        "UPDATE account_sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
        [admin.account_id]
      );
      await client.query("COMMIT");
      return { accountId: String(updated.account_id), email: String(updated.email), reset: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
  return actions;
}
