import { PublicError } from "../errors.js";
import { requireAdmin, requireAdminByToken } from "../services/admin.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler } from "../types.js";

function normalizePath(value: unknown): string {
  const path = String(value ?? "/").trim();
  if (!path.startsWith("/")) return "/";
  return path.slice(0, 500);
}

// 下载量统计支持的产品标识
const DOWNLOAD_PRODUCTS = new Set(["quizmate-android", "quizmate-windows", "quizmate-mac", "diskpilot-windows"]);

function shanghaiDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

interface TrendPoint {
  key: string;
  label: string;
  count: number;
}

// 按 day/week/month 聚合每日计数，返回最近区间内的数据点（官网访问与模型调用共用）
function buildTrendPoints(counts: Map<string, number>, period: string, today: string): { points: TrendPoint[]; total: number } {
  let points: TrendPoint[] = [];
  if (period === "day") {
    points = Array.from({ length: 30 }, (_, index) => addDays(today, index - 29)).map((key) => ({ key, label: key.slice(5).replace("-", "/"), count: counts.get(key) ?? 0 }));
  } else if (period === "week") {
    const buckets = new Map<string, number>();
    for (const [key, count] of counts) {
      const date = new Date(`${key}T00:00:00Z`); const day = (date.getUTCDay() + 6) % 7; const start = addDays(key, -day);
      buckets.set(start, (buckets.get(start) ?? 0) + count);
    }
    points = Array.from({ length: 12 }, (_, index) => addDays(today, (index - 11) * 7)).map((key) => { const date = new Date(`${key}T00:00:00Z`); const day = (date.getUTCDay() + 6) % 7; const start = addDays(key, -day); return { key: start, label: start.slice(5).replace("-", "/"), count: buckets.get(start) ?? 0 }; });
    points = [...new Map(points.map((item) => [item.key, item])).values()];
  } else {
    const buckets = new Map<string, number>(); for (const [key, count] of counts) { const month = key.slice(0, 7); buckets.set(month, (buckets.get(month) ?? 0) + count); }
    const now = new Date(`${today}T00:00:00Z`); points = Array.from({ length: 12 }, (_, index) => { const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index - 11, 1)); const key = date.toISOString().slice(0, 7); return { key, label: key.replace("-", "/"), count: buckets.get(key) ?? 0 }; });
  }
  return { points, total: [...counts.values()].reduce((a, b) => a + b, 0) };
}

export function createWebsiteActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();
  actions.set("trackWebsiteVisit", async (input, ctx) => {
    const day = shanghaiDate();
    const path = normalizePath(input.pagePath);
    const ip = ctx.clientIp || "unknown";
    // 记录每日总数
    await deps.db.query(
      `INSERT INTO website_daily_visits(visit_date, count, last_path, last_visited_at, created_at)
       VALUES ($1, 1, $2, now(), now())
       ON CONFLICT(visit_date) DO UPDATE SET count = website_daily_visits.count + 1,
         last_path = EXCLUDED.last_path, last_visited_at = now()`,
      [day, path]
    );
    // 记录访问日志（包含 IP）
    await deps.db.query(
      `INSERT INTO website_visit_logs(visit_date, client_ip, page_path, created_at)
       VALUES ($1, $2, $3, now())`,
      [day, ip, path]
    ).catch(() => undefined);
    return { recorded: true, date: day };
  });
  actions.set("adminWebsiteVisitTrend", async (input) => {
    await authenticateAdmin(deps, input);
    const period = String(input.period ?? "day").trim();
    if (!["day", "week", "month"].includes(period)) throw new PublicError("访问趋势周期无效。", "INVALID_VISIT_PERIOD");
    // 从 visit_logs 表查询，排除白名单 IP
    const result = await deps.db.query<{ visit_date: string; daily_count: string }>(
      `SELECT visit_date::text, count(*)::text AS daily_count
       FROM website_visit_logs
       WHERE client_ip NOT IN (SELECT client_ip FROM visit_whitelist)
       GROUP BY visit_date
       ORDER BY visit_date ASC`
    );
    const counts = new Map(result.rows.map((row) => [row.visit_date, Number(row.daily_count)]));
    const { points, total } = buildTrendPoints(counts, period, shanghaiDate());
    return { period, totalVisits: total, periodVisits: points.reduce((sum, item) => sum + item.count, 0), rangeStart: points[0]?.key ?? "", rangeEnd: points.at(-1)?.key ?? "", points };
  });

  actions.set("adminGetVisitDetails", async (input) => {
    await authenticateAdmin(deps, input);
    const day = String(input.date ?? shanghaiDate());
    const result = await deps.db.query<{ client_ip: string; visit_count: string; page_path: string; last_visit: string; is_whitelisted: boolean }>(
      `SELECT l.client_ip, count(*)::text AS visit_count, l.page_path, max(l.created_at)::text AS last_visit,
       EXISTS(SELECT 1 FROM visit_whitelist w WHERE w.client_ip = l.client_ip) AS is_whitelisted
       FROM website_visit_logs l
       WHERE l.visit_date = $1
       GROUP BY l.client_ip, l.page_path
       ORDER BY visit_count DESC
       LIMIT 100`,
      [day]
    );
    return { date: day, totalVisits: result.rows.length, items: result.rows.map(row => ({ clientIp: row.client_ip, visitCount: Number(row.visit_count), pagePath: row.page_path, lastVisit: row.last_visit, isWhitelisted: row.is_whitelisted })) };
  });

  actions.set("adminGetVisitWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const result = await deps.db.query<{ client_ip: string; note: string | null; created_at: string }>(
      "SELECT client_ip, note, created_at::text FROM visit_whitelist ORDER BY created_at DESC"
    );
    return { items: result.rows.map(row => ({ clientIp: row.client_ip, note: row.note, createdAt: row.created_at })) };
  });

  actions.set("adminAddVisitWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const ip = String(input.clientIp ?? "").trim();
    if (!ip) throw new PublicError("IP 地址不能为空。", "INVALID_IP");
    const note = String(input.note ?? "").trim().slice(0, 200);
    await deps.db.query(
      "INSERT INTO visit_whitelist(client_ip, note, created_at) VALUES ($1, $2, now()) ON CONFLICT(client_ip) DO UPDATE SET note = EXCLUDED.note",
      [ip, note]
    );
    return { added: true, clientIp: ip };
  });

  actions.set("adminRemoveVisitWhitelist", async (input) => {
    await authenticateAdmin(deps, input);
    const ip = String(input.clientIp ?? "").trim();
    if (!ip) throw new PublicError("IP 地址不能为空。", "INVALID_IP");
    await deps.db.query("DELETE FROM visit_whitelist WHERE client_ip = $1", [ip]);
    return { removed: true, clientIp: ip };
  });

  // 模型调用趋势：文本模型 / 图片模型 两条曲线，按 day/week/month 聚合
  actions.set("adminModelCallTrend", async (input) => {
    await authenticateAdmin(deps, input);
    const period = String(input.period ?? "day").trim();
    if (!["day", "week", "month"].includes(period)) throw new PublicError("模型调用趋势周期无效。", "INVALID_MODEL_TREND_PERIOD");
    const result = await deps.db.query<{ call_date: Date | string; model_type: string; count: string | number }>("SELECT call_date, model_type, count FROM model_daily_calls ORDER BY call_date ASC");
    const textCounts = new Map<string, number>();
    const imageCounts = new Map<string, number>();
    for (const row of result.rows) {
      const key = new Date(row.call_date).toISOString().slice(0, 10);
      const count = Number(row.count);
      if (row.model_type === "image") imageCounts.set(key, (imageCounts.get(key) ?? 0) + count);
      else textCounts.set(key, (textCounts.get(key) ?? 0) + count);
    }
    const today = shanghaiDate();
    const text = buildTrendPoints(textCounts, period, today);
    const image = buildTrendPoints(imageCounts, period, today);
    return {
      period,
      textTotal: text.total,
      imageTotal: image.total,
      periodTextCalls: text.points.reduce((sum, item) => sum + item.count, 0),
      periodImageCalls: image.points.reduce((sum, item) => sum + item.count, 0),
      rangeStart: text.points[0]?.key ?? "",
      rangeEnd: text.points.at(-1)?.key ?? "",
      textPoints: text.points,
      imagePoints: image.points
    };
  });

  // 下载量埋点：客户端点击下载按钮时上报，按产品 + 上海时区日期聚合
  actions.set("trackDownload", async (input) => {
    const product = String(input.product ?? "").trim();
    if (!DOWNLOAD_PRODUCTS.has(product)) throw new PublicError("未知的产品标识。", "INVALID_PRODUCT");
    const userAgent = String(input.userAgent ?? "").slice(0, 500);
    const day = shanghaiDate();
    await deps.db.query(
      `INSERT INTO download_daily_stats(stat_date, product, count, last_user_agent, last_downloaded_at, created_at)
       VALUES ($1, $2, 1, NULLIF($3, ''), now(), now())
       ON CONFLICT(stat_date, product) DO UPDATE SET count = download_daily_stats.count + 1,
         last_user_agent = EXCLUDED.last_user_agent, last_downloaded_at = now()`,
      [day, product, userAgent]
    );
    return { recorded: true, date: day, product };
  });

  // 下载量看板：返回各产品累计下载量与最近区间按天明细
  actions.set("adminDownloadStats", async (input) => {
    await authenticateAdmin(deps, input);
    const period = String(input.period ?? "day").trim();
    if (!["day", "week", "month"].includes(period)) throw new PublicError("下载量趋势周期无效。", "INVALID_DOWNLOAD_PERIOD");
    const summary = await deps.db.query<{ product: string; total: string }>(
      "SELECT product, COALESCE(sum(count),0)::text AS total FROM download_daily_stats GROUP BY product"
    );
    const totals: Record<string, number> = { "quizmate-android": 0, "quizmate-windows": 0, "quizmate-mac": 0, "diskpilot-windows": 0 };
    for (const row of summary.rows) totals[row.product] = Number(row.total);
    const trend = await deps.db.query<{ stat_date: Date | string; product: string; count: string | number }>(
      "SELECT stat_date, product, count FROM download_daily_stats ORDER BY stat_date ASC"
    );
    const productCounts: Record<string, Map<string, number>> = {
      "quizmate-android": new Map(), "quizmate-windows": new Map(), "quizmate-mac": new Map(), "diskpilot-windows": new Map()
    };
    for (const row of trend.rows) {
      const key = new Date(row.stat_date).toISOString().slice(0, 10);
      productCounts[row.product]?.set(key, Number(row.count));
    }
    const today = shanghaiDate();
    const series: Record<string, { points: TrendPoint[]; total: number; periodCount: number }> = {};
    for (const product of DOWNLOAD_PRODUCTS) {
      const built = buildTrendPoints(productCounts[product] ?? new Map(), period, today);
      series[product] = { points: built.points, total: built.total, periodCount: built.points.reduce((sum, item) => sum + item.count, 0) };
    }
    const firstPoints = series["quizmate-windows"]?.points ?? [];
    return {
      period,
      totals,
      grandTotal: Object.values(totals).reduce((a, b) => a + b, 0),
      rangeStart: firstPoints[0]?.key ?? "",
      rangeEnd: firstPoints.at(-1)?.key ?? "",
      series
    };
  });
  return actions;
}
