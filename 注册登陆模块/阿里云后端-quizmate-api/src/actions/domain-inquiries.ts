import { PublicError } from "../errors.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler } from "../types.js";

// 允许提交询价的域名白名单
const ALLOWED_DOMAINS = new Set(["bulidmate.com", "bulidbuddy.com"]);
// 询价通知收件人
const NOTIFY_TO = "wangpengroy@qq.com";

function trim(input: unknown, max: number): string {
  return String(input ?? "").trim().slice(0, max);
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shanghaiTime(): string {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function createDomainInquiryActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  // 公开提交：售卖页表单提交，落库 + 发邮件通知
  actions.set("submitDomainInquiry", async (input, ctx) => {
    const domain = trim(input.domain, 100).toLowerCase();
    if (!ALLOWED_DOMAINS.has(domain)) throw new PublicError("域名不在可询价范围内。", "INVALID_DOMAIN");
    const name = trim(input.name, 100);
    const phone = trim(input.phone, 50);
    const email = trim(input.email, 200);
    const offer = trim(input.offer, 200);
    const message = trim(input.message, 1000);
    if (!name) throw new PublicError("请填写姓名。", "MISSING_NAME");
    if (!phone) throw new PublicError("请填写联系电话。", "MISSING_PHONE");
    if (!email || !isEmailLike(email)) throw new PublicError("请填写有效的联系邮箱。", "INVALID_EMAIL");

    const clientIp = ctx.clientIp || "unknown";
    const userAgent = trim(input.userAgent, 500);
    const insertResult = await deps.db.query<{ id: string }>(
      `INSERT INTO domain_inquiries(domain, name, phone, email, offer, message, client_ip, user_agent, created_at)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, NULLIF($8, ''), now())
       RETURNING id::text`,
      [domain, name, phone, email, offer, message, clientIp, userAgent]
    );
    const inquiryId = String(insertResult.rows[0]?.id ?? "");

    // 发邮件通知（失败不阻断用户提交，仅记录日志）
    if (deps.sendNotification) {
      const subject = `[域名询价] ${domain} - ${name}`;
      const textLines = [
        `收到一条域名询价：`,
        `域名：${domain}`,
        `姓名：${name}`,
        `联系电话：${phone}`,
        `联系邮箱：${email}`,
        `预计出价：${offer || "-"}`,
        `留言：${message || "-"}`,
        `提交时间：${shanghaiTime()}`,
        `IP：${clientIp}`,
        `记录ID：${inquiryId}`
      ];
      const textBody = textLines.join("\n");
      const htmlBody = `<h3>收到一条域名询价</h3><table cellpadding="6" style="border-collapse:collapse;font-size:14px">`
        + `<tr><td style="color:#667085">域名</td><td><strong>${escapeHtml(domain)}</strong></td></tr>`
        + `<tr><td style="color:#667085">姓名</td><td>${escapeHtml(name)}</td></tr>`
        + `<tr><td style="color:#667085">联系电话</td><td>${escapeHtml(phone)}</td></tr>`
        + `<tr><td style="color:#667085">联系邮箱</td><td>${escapeHtml(email)}</td></tr>`
        + `<tr><td style="color:#667085">预计出价</td><td>${escapeHtml(offer || "-")}</td></tr>`
        + `<tr><td style="color:#667085">留言</td><td>${escapeHtml(message || "-")}</td></tr>`
        + `<tr><td style="color:#667085">提交时间</td><td>${escapeHtml(shanghaiTime())}</td></tr>`
        + `<tr><td style="color:#667085">来源 IP</td><td>${escapeHtml(clientIp)}</td></tr>`
        + `<tr><td style="color:#667085">记录 ID</td><td>${escapeHtml(inquiryId)}</td></tr>`
        + `</table>`;
      await deps.sendNotification(NOTIFY_TO, subject, textBody, htmlBody).catch((error) => {
        // 邮件发送失败不阻断用户，仅记录
        console.error("[domainInquiry] notify email failed:", error);
      });
    }

    return { received: true, inquiryId, contactEmail: NOTIFY_TO };
  });

  // 后台分页查询
  actions.set("adminListDomainInquiries", async (input) => {
    await authenticateAdmin(deps, input);
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize ?? 20))));
    const requestedPage = Math.max(1, Math.floor(Number(input.page ?? 1)));
    const domainFilter = trim(input.domain, 100).toLowerCase();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (domainFilter) {
      params.push(domainFilter);
      conditions.push(`domain = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await deps.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM domain_inquiries ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT id::text AS id, domain, name, phone, email, offer, message, client_ip, user_agent, created_at::text AS created_at
       FROM domain_inquiries ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      items: result.rows.map((row) => ({
        id: String(row.id ?? ""),
        domain: String(row.domain ?? ""),
        name: String(row.name ?? ""),
        phone: String(row.phone ?? ""),
        email: String(row.email ?? ""),
        offer: String(row.offer ?? ""),
        message: String(row.message ?? ""),
        clientIp: String(row.client_ip ?? ""),
        userAgent: String(row.user_agent ?? ""),
        createdAt: String(row.created_at ?? "")
      })),
      page,
      pageSize,
      total,
      totalPages
    };
  });

  return actions;
}
