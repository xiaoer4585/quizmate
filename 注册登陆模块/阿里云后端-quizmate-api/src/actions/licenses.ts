import crypto from "node:crypto";
import type { Queryable } from "../db.js";
import { PublicError } from "../errors.js";
import { requireAdmin } from "../services/admin.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

export interface LegacyLicenseRow {
  license_id: string;
  code: string;
  status: string;
  days: number | null;
  device_id: string | null;
  activated_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  source: string | null;
  note: string | null;
  reset_at: Date | string | null;
}

export function normalizeLicenseCode(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase().slice(0, 160);
}

export function normalizeDeviceId(value: unknown): string {
  // Device identifiers are telemetry only. An absent identifier must never block auth.
  return String(value ?? "").trim().slice(0, 160) || "__unbound__";
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function publicLicense(row: LegacyLicenseRow) {
  return {
    code: row.code,
    days: Number(row.days ?? 0),
    status: row.status,
    activatedAt: iso(row.activated_at),
    expiresAt: iso(row.expires_at),
    deviceId: row.device_id ?? ""
  };
}

function publicAdminLicense(row: LegacyLicenseRow) {
  return {
    ...publicLicense(row),
    source: row.source ?? "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    note: row.note ?? "",
    resetAt: iso(row.reset_at)
  };
}

function normalizeDays(value: unknown): number {
  if (value === "forever" || value === 0 || value === "0") return 0;
  const days = Number(value);
  if (![1, 30, 60, 90, 365].includes(days)) throw new PublicError("授权时长只能是 1、30、60、90、365 天。", "INVALID_LICENSE_DAYS");
  return days;
}

function expiry(days: number, from: Date): Date | null {
  return days ? new Date(from.getTime() + days * 86_400_000) : null;
}

async function findLicense(client: Queryable, code: string, lock = false): Promise<LegacyLicenseRow | undefined> {
  const result = await client.query<LegacyLicenseRow>(
    `SELECT * FROM legacy_licenses WHERE code = $1${lock ? " FOR UPDATE" : ""}`,
    [code]
  );
  return result.rows[0];
}

export async function requireActiveLicense(deps: ActionDependencies, input: ActionInput): Promise<LegacyLicenseRow> {
  const code = normalizeLicenseCode(input.code ?? input.licenseCode);
  // Device identity is optional; legacy license access is account/license scoped.
  const deviceId = normalizeDeviceId(input.deviceId) || "legacy_unbound";
  if (!code) throw new PublicError("请输入授权序列号。", "LICENSE_REQUIRED", 401);
  if (!deviceId) throw new PublicError("无法识别当前设备，请重新打开插件。", "DEVICE_REQUIRED");
  const result = await deps.db.query<LegacyLicenseRow>("SELECT * FROM legacy_licenses WHERE code = $1", [code]);
  const license = result.rows[0] ? { ...result.rows[0], device_id: null } : undefined;
  if (!license) throw new PublicError("序列号不存在，请检查后重新输入。", "LICENSE_NOT_FOUND", 404);
  if (license.status === "disabled") throw new PublicError("序列号已被停用。", "LICENSE_DISABLED", 403);
  if (license.device_id && license.device_id !== deviceId) throw new PublicError("序列号已经绑定另一台设备，请联系管理员重置或重新购买。", "LICENSE_DEVICE_MISMATCH", 403);
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) throw new PublicError("序列号已过期，请重新购买。", "LICENSE_EXPIRED", 403);
  if (license.status !== "active") throw new PublicError("序列号尚未激活。", "LICENSE_INACTIVE", 403);
  return license;
}

function activateHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const code = normalizeLicenseCode(input.code ?? input.licenseCode);
    // Device identity is optional; activation must not be blocked by missing hardware id.
    const deviceId = normalizeDeviceId(input.deviceId) || "legacy_unbound";
    if (!code) throw new PublicError("请输入授权序列号。", "LICENSE_REQUIRED");
    if (!deviceId) throw new PublicError("无法识别当前设备，请重新打开插件。", "DEVICE_REQUIRED");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const foundLicense = await findLicense(client, code, true);
      const license = foundLicense ? { ...foundLicense, device_id: null } : undefined;
      if (!license) throw new PublicError("序列号不存在，请检查后重新输入。", "LICENSE_NOT_FOUND", 404);
      if (license.status === "disabled") throw new PublicError("序列号已被停用。", "LICENSE_DISABLED", 403);
      if (license.device_id && license.device_id !== deviceId) throw new PublicError("序列号已经绑定另一台设备，请联系管理员重置或重新购买。", "LICENSE_DEVICE_MISMATCH", 403);
      const activatedAt = license.activated_at ? new Date(license.activated_at) : new Date();
      const expiresAt = license.expires_at ? new Date(license.expires_at) : expiry(Number(license.days ?? 0), activatedAt);
      if (expiresAt && expiresAt.getTime() <= Date.now()) throw new PublicError("序列号已过期，请重新购买。", "LICENSE_EXPIRED", 403);
      const updated = await client.query<LegacyLicenseRow>(
        `UPDATE legacy_licenses SET status = 'active', activated_at = $2,
           expires_at = $3, updated_at = now() WHERE code = $1 RETURNING *`,
        [code, activatedAt, expiresAt]
      );
      const next = updated.rows[0];
      if (!next) throw new Error("license update failed");
      await client.query("COMMIT");
      return { license: publicLicense(next) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

export function createLicenseActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();
  actions.set("startTrial", async () => { throw new PublicError("免费自动试用已关闭，请完成新手指引后选择支付宝套餐。", "TRIAL_CLOSED"); });
  actions.set("activateLicense", activateHandler(deps));
  actions.set("checkLicense", async (input) => ({ license: publicLicense(await requireActiveLicense(deps, input)) }));

  actions.set("adminCreateLicenses", async (input) => {
    await authenticateAdmin(deps, input);
    const count = Math.max(1, Math.min(200, Math.floor(Number(input.count ?? 1))));
    const days = normalizeDays(input.days ?? 1);
    const items: ReturnType<typeof publicAdminLicense>[] = [];
    for (let index = 0; index < count; index += 1) {
      let row: LegacyLicenseRow | undefined;
      for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
        const code = crypto.randomBytes(12).toString("hex").slice(0, 16).toUpperCase();
        const result = await deps.db.query<LegacyLicenseRow>(
          `INSERT INTO legacy_licenses(code, status, days, source, created_at, updated_at)
           VALUES ($1, 'unused', $2, 'admin', now(), now()) ON CONFLICT(code) DO NOTHING RETURNING *`,
          [code, days]
        );
        row = result.rows[0];
      }
      if (!row) throw new Error("failed to create unique license");
      items.push(publicAdminLicense(row));
    }
    return { items };
  });

  const unbind = async (input: ActionInput, reset: boolean) => {
    await authenticateAdmin(deps, input);
    const code = normalizeLicenseCode(input.code ?? input.licenseCode);
    if (!code) throw new PublicError("请输入需要解绑的序列号。", "LICENSE_REQUIRED");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const before = await findLicense(client, code, true);
      if (!before) throw new PublicError("序列号不存在。", "LICENSE_NOT_FOUND", 404);
      const result = await client.query<LegacyLicenseRow>(
        `UPDATE legacy_licenses SET device_id = NULL,
           status = CASE WHEN $2 THEN 'unused' ELSE status END,
           activated_at = CASE WHEN $2 THEN NULL ELSE activated_at END,
           expires_at = CASE WHEN $2 THEN NULL ELSE expires_at END,
           reset_at = CASE WHEN $2 THEN now() ELSE reset_at END,
           updated_at = now() WHERE code = $1 RETURNING *`,
        [code, reset]
      );
      const removed = await client.query("DELETE FROM devices WHERE legacy_license_code = $1", [code]);
      await client.query("COMMIT");
      return { license: publicAdminLicense(result.rows[0]!), ...(reset ? { resetCount: 1, deviceRecordsRemoved: removed.rowCount ?? 0 } : {}) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
  actions.set("adminResetLicense", (input) => unbind(input, true));
  actions.set("adminUnbindLicense", (input) => unbind(input, false));

  actions.set("adminBindLicense", async (input) => {
    await authenticateAdmin(deps, input);
    return activateHandler(deps)(input, { requestId: "admin-bind", clientIp: "", db: deps.db });
  });

  actions.set("adminListLicenses", async (input) => {
    await authenticateAdmin(deps, input);
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize ?? input.limit ?? 20))));
    const totalResult = await deps.db.query<{ count: string }>("SELECT count(*)::text AS count FROM legacy_licenses");
    const total = Number(totalResult.rows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Math.floor(Number(input.page ?? 1))));
    const result = await deps.db.query<LegacyLicenseRow>("SELECT * FROM legacy_licenses ORDER BY created_at DESC LIMIT $1 OFFSET $2", [pageSize, (page - 1) * pageSize]);
    return { items: result.rows.map(publicAdminLicense), page, pageSize, total, totalPages };
  });
  return actions;
}
