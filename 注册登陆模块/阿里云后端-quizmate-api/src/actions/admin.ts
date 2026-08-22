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
  actions.set("adminListCreditAccounts", async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    const total = Number((await deps.db.query<{ count: string }>("SELECT count(*)::text AS count FROM accounts")).rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT a.*, c.credits, c.total_charged_credits, c.total_consumed_credits
       FROM accounts a JOIN credit_accounts c USING(account_id) ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize]
    );
    return { items: result.rows.map((row) => ({ accountId: String(row.account_id), email: String(row.email), credits: Number(row.credits), totalChargedCredits: Number(row.total_charged_credits), totalConsumedCredits: Number(row.total_consumed_credits), registerBonusCredits: Number(row.register_bonus_credits), status: String(row.status), role: String(row.role ?? "user"), createdAt: date(row.created_at), lastLoginAt: date(row.last_login_at), updatedAt: date(row.updated_at), type: "credits" })), page, pageSize, total, totalPages };
  });
  actions.set("adminListCreditLogs", async (input) => {
    await authenticateAdmin(deps, input);
    const { pageSize, requestedPage } = paging(input);
    const total = Number((await deps.db.query<{ count: string }>("SELECT count(*)::text AS count FROM credit_ledger")).rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT l.*, a.email FROM credit_ledger l JOIN accounts a USING(account_id)
       ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize]
    );
    return { items: result.rows.map((row) => ({
      logId: String(row.log_id ?? ""), accountId: String(row.account_id ?? ""), email: String(row.email ?? ""), type: String(row.operation_type ?? ""),
      credits: Number(row.credits ?? 0), balanceAfter: Number(row.balance_after ?? 0), source: String(row.source ?? ""), orderNo: String(row.order_no ?? ""),
      packageId: String(row.package_id ?? ""), deviceId: String(row.device_id ?? ""), requestId: String(row.request_id ?? ""), createdAt: date(row.created_at)
    })), page, pageSize, total, totalPages };
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
