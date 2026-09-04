import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

async function accountForToken(deps: ActionDependencies, input: ActionInput): Promise<{ id: string; email: string }> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录积分账户。", "AUTH_REQUIRED", 401);
  const r = await deps.db.query<{ account_id: string; email: string }>(
    `SELECT a.account_id, a.email FROM account_sessions s JOIN accounts a USING(account_id)
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())`, [tokenHash]);
  const row = r.rows[0];
  if (!row) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  return { id: String(row.account_id), email: String(row.email) };
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function createFeedbackActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();
  actions.set("submitFeedback", async (input) => {
    const account = await accountForToken(deps, input);
    const description = clean(input.description, 5000);
    if (!description) throw new PublicError("请填写问题描述。", "FEEDBACK_DESCRIPTION_REQUIRED");
    const rawData = String(input.attachmentData ?? "");
    if (rawData.length > 7_000_000) throw new PublicError("附件不能超过 5MB。", "FEEDBACK_ATTACHMENT_TOO_LARGE", 413);
    const data = rawData.trim();
    if (data && !/^data:[^;]+;base64,[A-Za-z0-9+/=\s]+$/i.test(data)) throw new PublicError("附件格式不支持。", "INVALID_ATTACHMENT");
    const r = await deps.db.query<{ feedback_id: string; created_at: string }>(
      `INSERT INTO user_feedback(account_id,email,description,attachment_name,attachment_data,attachment_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING feedback_id,created_at`,
      [account.id, account.email, description, clean(input.attachmentName, 180), data, clean(input.attachmentType, 120)]);
    return { feedbackId: String(r.rows[0]?.feedback_id ?? ""), createdAt: r.rows[0]?.created_at };
  });
  actions.set("adminListFeedback", async (input) => {
    await authenticateAdmin(deps, input);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit ?? input.pageSize ?? 20))));
    const page = Math.max(1, Math.floor(Number(input.page ?? 1)));
    const count = Number((await deps.db.query<{ count: string }>("SELECT count(*)::text AS count FROM user_feedback")).rows[0]?.count ?? 0);
    const rows = await deps.db.query<Record<string, unknown>>(
      `SELECT feedback_id,email,description,attachment_name,attachment_type,status,created_at
         FROM user_feedback ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]);
    return { items: rows.rows.map((r) => ({ feedbackId: String(r.feedback_id), email: String(r.email ?? ""), description: String(r.description ?? ""), attachmentName: String(r.attachment_name ?? ""), attachmentType: String(r.attachment_type ?? ""), status: String(r.status ?? "open"), createdAt: r.created_at })), page, pageSize: limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) };
  });
  actions.set("getClientAnnouncements", async () => {
    const value = deps.settings ? await deps.settings.get("client_announcements") : {};
    return { exam: clean(value.exam, 1000), interview: clean(value.interview, 1000), updatedAt: clean(value.updatedAt, 80) };
  });
  actions.set("adminGetAnnouncements", async (input) => { await authenticateAdmin(deps, input); const value = deps.settings ? await deps.settings.get("client_announcements") : {}; return { exam: clean(value.exam, 1000), interview: clean(value.interview, 1000), updatedAt: clean(value.updatedAt, 80) }; });
  actions.set("adminSetAnnouncements", async (input) => { await authenticateAdmin(deps, input); if (!deps.settings) throw new PublicError("运行配置服务尚未初始化。", "SETTINGS_NOT_CONFIGURED", 503); const value = { exam: clean(input.exam, 1000), interview: clean(input.interview, 1000), updatedAt: new Date().toISOString() }; await deps.settings.set("client_announcements", value, "admin"); return value; });
  return actions;
}
