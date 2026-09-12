// 网申引擎站点配置与声明式热规则的服务端部分。
// - getSiteEngineConfig：客户端按 hostname 拉取站点引擎配置 + 已启用的 JSON 补丁（登录即可，免费）
// - adminSetSiteConfig / adminAddEnginePatch 等：管理动作，把新站点的方法沉淀进规则库
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

// 配置允许的顶层键（声明式规则，客户端引擎按需消费）
const ALLOWED_CONFIG_KEYS = new Set([
  "selectors", // { popup: [], option: [], trigger: [], datePicker: [], cascade: [], customSelect: [] }
  "valueRules", // [{ datePart: "month", labelPattern: "毕业时间", add: ["一月", ...] }]
  "strategies", // { clickInner: true, confirmButton: true, ... }
  "adapterRegistry" // { generic, platforms, companies }，由客户端声明式注册表消费
]);

const MAX_CONFIG_JSON = 60_000;
const MAX_PATCH_JSON = 40_000;
const MAX_PATCHES_PER_SITE = 20;

function normalizeHostname(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .slice(0, 255);
}

async function authenticate(deps: ActionDependencies, input: ActionInput): Promise<void> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录后使用网申引擎配置。", "AUTH_REQUIRED", 401);
  const result = await deps.db.query<{ status: string }>(
    `SELECT a.status
       FROM account_sessions s JOIN accounts a USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status !== "active") throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
}

function sanitizeConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicError("站点配置必须是对象。", "INVALID_SITE_CONFIG");
  }
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(source)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) continue;
    if (inner == null) continue;
    output[key] = inner;
  }
  if (JSON.stringify(output).length > MAX_CONFIG_JSON) {
    throw new PublicError("站点配置过大，请精简后重试。", "INVALID_SITE_CONFIG", 413);
  }
  return output;
}

function mergeConfig(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const previous = output[key];
    output[key] = previous && value && typeof previous === "object" && typeof value === "object" && !Array.isArray(previous) && !Array.isArray(value)
      ? { ...(previous as Record<string, unknown>), ...(value as Record<string, unknown>) }
      : value;
  }
  return output;
}

export function createSiteEngineActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  // 客户端拉取：站点配置 + 该站点（含全局）已启用补丁
  actions.set("getSiteEngineConfig", async (input) => {
    await authenticate(deps, input);
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) return { siteConfig: null, patches: [] };
    const configResult = await deps.db.query<{ config: Record<string, unknown> }>(
      "SELECT config FROM resume_site_configs WHERE hostname = $1",
      [hostname]
    );
    const patchResult = await deps.db.query<{ id: string; patch: Record<string, unknown>; version: string; note: string }>(
      `SELECT id, patch, version, note FROM resume_engine_patches
        WHERE enabled = true AND hostname IN ('', $1)
        ORDER BY hostname = '' DESC, id ASC
        LIMIT ${2 * MAX_PATCHES_PER_SITE}`,
      [hostname]
    );
    const patches = patchResult.rows
      .slice(0, MAX_PATCHES_PER_SITE * 2)
      .filter((row) => JSON.stringify(row.patch || {}).length <= MAX_PATCH_JSON)
      .map((row) => ({
        id: String(row.id),
        patch: row.patch || {},
        version: Number(row.version || 1),
        note: String(row.note || "")
      }));
    const siteConfig = configResult.rows[0]?.config || {};
    return {
      siteConfig: patches.reduce((current, item) => mergeConfig(current, item.patch), siteConfig),
      patches
    };
  });

  // ---------- 管理动作 ----------
  actions.set("adminSetSiteConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = normalizeHostname(input.hostname);
    if (!hostname || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) {
      throw new PublicError("hostname 无效。", "INVALID_HOSTNAME");
    }
    const config = sanitizeConfig(input.config);
    const note = String(input.note ?? "").slice(0, 300);
    const updatedBy = String(input.updatedBy ?? "admin").slice(0, 100);
    await deps.db.query(
      `INSERT INTO resume_site_configs (hostname, config, note, updated_at, updated_by)
       VALUES ($1, $2::jsonb, $3, now(), $4)
       ON CONFLICT (hostname) DO UPDATE SET
         config = EXCLUDED.config, note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [hostname, JSON.stringify(config), note, updatedBy]
    );
    return { hostname, config };
  });

  actions.set("adminGetSiteConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = normalizeHostname(input.hostname);
    const result = await deps.db.query<{ hostname: string; config: Record<string, unknown>; note: string; updated_at: Date }>(
      "SELECT hostname, config, note, updated_at FROM resume_site_configs WHERE hostname = $1",
      [hostname]
    );
    const row = result.rows[0];
    if (!row) return { hostname, config: null };
    return { hostname: row.hostname, config: row.config, note: row.note, updatedAt: row.updated_at };
  });

  actions.set("adminListSiteConfigs", async (input) => {
    await authenticateAdmin(deps, input);
    const result = await deps.db.query<{ hostname: string; config: Record<string, unknown>; note: string; updated_at: Date; success_sum: string; failure_sum: string }>(
      `SELECT c.hostname, c.config, c.note, c.updated_at,
              COALESCE(SUM(r.success_count), 0)::text AS success_sum,
              COALESCE(SUM(r.failure_count), 0)::text AS failure_sum
         FROM resume_site_configs c
         LEFT JOIN resume_page_rules r ON r.hostname = c.hostname
        GROUP BY c.hostname, c.config, c.note, c.updated_at
        ORDER BY c.updated_at DESC
        LIMIT 500`
    );
    return {
      items: result.rows.map((row) => ({
        hostname: row.hostname,
        config: row.config,
        note: row.note,
        updatedAt: row.updated_at,
        pageRuleSuccess: Number(row.success_sum || 0),
        pageRuleFailure: Number(row.failure_sum || 0)
      }))
    };
  });

  actions.set("adminDeleteSiteConfig", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = normalizeHostname(input.hostname);
    const result = await deps.db.query("DELETE FROM resume_site_configs WHERE hostname = $1 RETURNING hostname", [hostname]);
    return { deleted: result.rowCount ? result.rowCount > 0 : false };
  });

  actions.set("adminAddEnginePatch", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = normalizeHostname(input.hostname); // 空串 = 全局
    const patch = sanitizeConfig(input.patch);
    if (JSON.stringify(patch).length > MAX_PATCH_JSON) throw new PublicError("热规则过大。", "INVALID_PATCH", 413);
    const note = String(input.note ?? "").slice(0, 300);
    const result = await deps.db.query<{ id: string; version: string }>(
      `INSERT INTO resume_engine_patches (hostname, patch, note, enabled, version)
       VALUES ($1, $2::jsonb, $3, true, 1) RETURNING id, version`,
      [hostname, JSON.stringify(patch), note]
    );
    const inserted = result.rows[0];
    if (!inserted) throw new PublicError("补丁写入失败。", "PATCH_WRITE_FAILED", 500);
    return { id: String(inserted.id), hostname, note };
  });

  actions.set("adminListEnginePatches", async (input) => {
    await authenticateAdmin(deps, input);
    const hostname = normalizeHostname(input.hostname);
    const result = await deps.db.query<{ id: string; hostname: string; patch: Record<string, unknown>; note: string; enabled: boolean; version: string; created_at: Date }>(
      hostname
        ? "SELECT id, hostname, patch, note, enabled, version, created_at FROM resume_engine_patches WHERE hostname IN ('', $1) ORDER BY hostname = '' ASC, id ASC LIMIT 200"
        : "SELECT id, hostname, patch, note, enabled, version, created_at FROM resume_engine_patches ORDER BY id DESC LIMIT 200",
      hostname ? [hostname] : []
    );
    return {
      items: result.rows.map((row) => ({
        id: String(row.id),
        hostname: row.hostname,
        patch: row.patch,
        note: row.note,
        enabled: row.enabled,
        version: Number(row.version || 1),
        createdAt: row.created_at
      }))
    };
  });

  actions.set("adminToggleEnginePatch", async (input) => {
    await authenticateAdmin(deps, input);
    const id = Number(input.id);
    if (!Number.isInteger(id) || id <= 0) throw new PublicError("补丁编号无效。", "INVALID_PATCH_ID");
    const result = await deps.db.query<{ id: string; version: string }>(
      `UPDATE resume_engine_patches
          SET enabled = NOT enabled, version = version + 1
        WHERE id = $1 RETURNING id, version, enabled`,
      [id]
    );
    const row = result.rows[0];
    if (!row) throw new PublicError("补丁不存在。", "PATCH_NOT_FOUND", 404);
    return { id: String(row.id), version: Number(row.version || 1) };
  });

  actions.set("adminDeleteEnginePatch", async (input) => {
    await authenticateAdmin(deps, input);
    const id = Number(input.id);
    if (!Number.isInteger(id) || id <= 0) throw new PublicError("补丁编号无效。", "INVALID_PATCH_ID");
    const result = await deps.db.query("DELETE FROM resume_engine_patches WHERE id = $1 RETURNING id", [id]);
    return { deleted: result.rowCount ? result.rowCount > 0 : false };
  });

  return actions;
}

export const siteEngineInternals = { normalizeHostname, sanitizeConfig, mergeConfig };
