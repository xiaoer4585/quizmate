import { describe, expect, it } from "vitest";
import { createAdminActions } from "../src/actions/admin.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies, ActionHandler } from "../src/types.js";

interface CapturedQuery {
  text: string;
  values: unknown[];
}

function fakeDb(results: (query: CapturedQuery) => { rows: Record<string, unknown>[]; rowCount: number }) {
  const queries: CapturedQuery[] = [];
  const db = {
    query: async (text: string, values: unknown[] = []) => {
      const captured = { text, values: [...values] };
      queries.push(captured);
      return results(captured);
    },
    connect: async () => { throw new Error("unexpected connection"); }
  } as unknown as Database;
  return { db, queries };
}

function dependencies(db: Database, adminSecret = "secret-key"): ActionDependencies {
  return {
    db,
    config: {} as ActionDependencies["config"],
    emailCodeSecret: "test-secret",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] }),
    adminSecret
  };
}

function handler(deps: ActionDependencies, action: string): ActionHandler {
  const found = createAdminActions(deps).get(action);
  if (!found) throw new Error(`${action} missing`);
  return found;
}

const context = { requestId: "test", clientIp: "127.0.0.1", db: undefined as never };

describe("credit account platform filter (CHG-20260822-04)", () => {
  it("rejects unsupported platform values", async () => {
    const { db } = fakeDb(() => ({ rows: [], rowCount: 0 }));
    await expect(
      handler(dependencies(db), "adminListCreditAccounts")({ adminSecret: "secret-key", platform: "ios-app" }, context)
    ).rejects.toMatchObject({ code: "INVALID_PLATFORM" });
  });

  it("adds a lateral subquery to look up the latest non-null session platform", async () => {
    const { db, queries } = fakeDb((query) => (
      query.text.includes("count(*)") ? { rows: [{ count: "5" }], rowCount: 1 } : { rows: [{ account_id: "acc-1", email: "a@x.cn", credits: "10", session_platform: "win32-desktop" }], rowCount: 1 }
    ));
    const result = await handler(dependencies(db), "adminListCreditAccounts")({ adminSecret: "secret-key", page: 1, pageSize: 20 }, context);
    expect(result).toMatchObject({ total: 5 });
    const listQuery = queries.find((q) => q.text.includes("ORDER BY a.created_at DESC"))!;
    expect(listQuery.text).toContain("LEFT JOIN LATERAL");
    expect(listQuery.text).toContain("SELECT s.platform FROM account_sessions s");
    expect(listQuery.text).toContain("session_platform");
    expect(listQuery.values).toEqual([20, 0]);
  });

  it("filters accounts by the requested platform and propagates the value to the page query", async () => {
    const { db, queries } = fakeDb((query) => (
      query.text.includes("count(*)") ? { rows: [{ count: "2" }], rowCount: 1 } : { rows: [], rowCount: 0 }
    ));
    const result = await handler(dependencies(db), "adminListCreditAccounts")({ adminSecret: "secret-key", platform: "darwin-desktop", page: 1, pageSize: 10 }, context);
    expect(result).toMatchObject({ total: 2 });
    for (const query of queries) {
      expect(query.text).toContain("s.platform = $1");
    }
    expect(queries[0]!.values).toEqual(["darwin-desktop"]);
    expect(queries[1]!.values).toEqual(["darwin-desktop", 10, 0]);
  });

  it("returns the session platform value as a string in the response items", async () => {
    const { db } = fakeDb((query) => (
      query.text.includes("count(*)") ? { rows: [{ count: "1" }], rowCount: 1 } : {
        rows: [{
          account_id: "acc-9",
          email: "test@quizmate.cn",
          credits: "120",
          total_charged_credits: "200",
          total_consumed_credits: "80",
          register_bonus_credits: "20",
          status: "active",
          role: "user",
          created_at: "2026-08-22 10:00:00+08",
          last_login_at: "2026-08-22 11:00:00+08",
          updated_at: "2026-08-22 11:00:00+08",
          session_platform: "browser-extension"
        }],
        rowCount: 1
      }
    ));
    const result = await handler(dependencies(db), "adminListCreditAccounts")({ adminSecret: "secret-key", page: 1, pageSize: 10 }, context);
    expect(result.items[0]).toMatchObject({ accountId: "acc-9", email: "test@quizmate.cn", platform: "browser-extension" });
  });

  it("treats accounts without sessions as empty platform", async () => {
    const { db } = fakeDb((query) => (
      query.text.includes("count(*)") ? { rows: [{ count: "1" }], rowCount: 1 } : {
        rows: [{
          account_id: "acc-10",
          email: "no-session@quizmate.cn",
          credits: "20",
          total_charged_credits: "0",
          total_consumed_credits: "0",
          register_bonus_credits: "20",
          status: "active",
          role: "user",
          created_at: "2026-08-22 09:00:00+08",
          last_login_at: null,
          updated_at: "2026-08-22 09:00:00+08",
          session_platform: null
        }],
        rowCount: 1
      }
    ));
    const result = await handler(dependencies(db), "adminListCreditAccounts")({ adminSecret: "secret-key", page: 1, pageSize: 10 }, context);
    expect(result.items[0]).toMatchObject({ platform: "" });
  });
});