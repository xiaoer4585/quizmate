import { describe, expect, it } from "vitest";
import { createAdminActions } from "../src/actions/admin.js";
import type { ActionDependencies } from "../src/types.js";

function makeDeps(query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>) {
  return {
    db: { query, connect: async () => { throw new Error("not used"); } },
    adminSecret: "secret",
    emailCodeSecret: "test",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] })
  } as unknown as ActionDependencies;
}

describe("admin credit platform metadata", () => {
  it("returns and filters the latest account session platform", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const deps = makeDeps(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("count(*)")) return { rows: [{ count: "1" }], rowCount: 1 };
      return { rows: [{ account_id: "a1", email: "user@example.com", credits: "12", total_charged_credits: "30", total_consumed_credits: "18", register_bonus_credits: "5", status: "active", role: "user", session_platform: "android" }], rowCount: 1 };
    });
    const data = await createAdminActions(deps).get("adminListCreditAccounts")!({ adminSecret: "secret", platform: "android", page: 1, pageSize: 20 });

    expect(data.items[0].platform).toBe("android");
    expect(calls[0].sql).toContain("LEFT JOIN LATERAL");
    expect(calls[0].sql).toContain("s.platform IN ('win32', 'win32-desktop')");
    expect(calls[0].sql).toContain("s.platform IN ('darwin', 'darwin-desktop')");
    expect(calls[0].sql).toContain("latest.platform = $1");
    expect(calls[1].sql).toContain("latest.platform AS session_platform");
    expect(calls[1].params).toEqual(["android", 20, 0]);
  });

  it("returns and filters the latest log session platform", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const deps = makeDeps(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("count(*)")) return { rows: [{ count: "1" }], rowCount: 1 };
      return { rows: [{ log_id: "l1", account_id: "a1", email: "user@example.com", operation_type: "consume", credits: "-1", balance_after: "11", session_platform: "win32-desktop" }], rowCount: 1 };
    });
    const data = await createAdminActions(deps).get("adminListCreditLogs")!({ adminSecret: "secret", email: "user", platform: "win32-desktop", page: 1, pageSize: 10 });

    expect(data.items[0].platform).toBe("win32-desktop");
    expect(calls[0].sql).toContain("lower(a.email) LIKE $1");
    expect(calls[0].sql).toContain("latest.platform = $2");
    expect(calls[1].sql).toContain("latest.platform AS session_platform");
    expect(calls[1].params).toEqual(["%user%", "win32-desktop", 10, 0]);
  });

  it("rejects unsupported platform filters", async () => {
    const deps = makeDeps(async () => ({ rows: [], rowCount: 0 }));
    await expect(createAdminActions(deps).get("adminListCreditAccounts")!({ adminSecret: "secret", platform: "ios-app" }))
      .rejects.toMatchObject({ code: "INVALID_PLATFORM" });
  });
});
