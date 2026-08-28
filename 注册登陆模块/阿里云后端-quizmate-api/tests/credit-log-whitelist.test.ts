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

describe("credit log whitelist admin actions", () => {
  it("keeps the legacy listing SQL when no filter is supplied", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes("count(*)") ? { rows: [{ count: "3" }], rowCount: 1 } : { rows: [{ log_id: "L1" }], rowCount: 1 }));
    const result = await handler(dependencies(db), "adminListCreditLogs")({ adminSecret: "secret-key", page: 1, pageSize: 20 }, context);
    expect(result).toMatchObject({ total: 3, page: 1, pageSize: 20, totalPages: 1 });
    expect(queries[0]!.text).not.toMatch(/JOIN credit_ledger|credit_log_whitelist/);
    // 列表查询固定带 LEFT JOIN LATERAL（CHG-20260822-03，内部含 WHERE），仅断言外部 WHERE 子句没被注入
    // LATERAL 内部本身带 WHERE，因此改为检查"ON true"之后是否再出现 "WHERE "（即外部是否被注入筛选条件）
    const onTrueIndex = queries[1]!.text.indexOf("ON true");
    expect(onTrueIndex).toBeGreaterThan(-1);
    expect(queries[1]!.text.slice(onTrueIndex).includes("WHERE ")).toBe(false);
    expect(queries[1]!.values).toEqual([20, 0]);
  });

  it("excludes whitelisted emails from the count and the page query", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes("count(*)") ? { rows: [{ count: "2" }], rowCount: 1 } : { rows: [{ log_id: "L2" }], rowCount: 1 }));
    const result = await handler(dependencies(db), "adminListCreditLogs")({ adminSecret: "secret-key", page: 1, pageSize: 10, excludeWhitelist: true }, context);
    expect(result).toMatchObject({ total: 2, pageSize: 10 });
    for (const query of queries) {
      expect(query.text).toContain("NOT IN (SELECT email FROM credit_log_whitelist)");
    }
    expect(queries[1]!.values).toEqual([10, 0]);
  });

  it("supports fuzzy email search combined with the whitelist filter", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes("count(*)") ? { rows: [{ count: "1" }], rowCount: 1 } : { rows: [], rowCount: 0 }));
    await handler(dependencies(db), "adminListCreditLogs")({ adminSecret: "secret-key", page: 2, pageSize: 10, email: "TEST@Example.com", excludeWhitelist: "true" }, context);
    expect(queries[0]!.text).toContain("a.email ILIKE $1");
    expect(queries[0]!.values).toEqual(["%test@example.com%"]);
    // total=1 时请求 page=2 会被钳制到第 1 页，offset 回到 0
    expect(queries[1]!.values).toEqual(["%test@example.com%", 10, 0]);
  });

  it("rejects missing admin credentials on every whitelist action", async () => {
    const { db } = fakeDb(() => ({ rows: [], rowCount: 0 }));
    const deps = dependencies(db, "");
    for (const action of ["adminGetCreditWhitelist", "adminAddCreditWhitelist", "adminRemoveCreditWhitelist", "adminListCreditLogs"]) {
      await expect(handler(deps, action)({ email: "a@b.com" }, context)).rejects.toMatchObject({ code: "ADMIN_AUTH_FAILED" });
    }
  });

  it("adds, lists and removes whitelist emails with normalization and validation", async () => {
    const { db, queries } = fakeDb((query) => {
      if (query.text.includes("credit_log_whitelist") && query.text.startsWith("SELECT")) {
        return { rows: [{ email: "test@example.com", note: "自测", created_at: "2026-08-16" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const deps = dependencies(db);
    const add = await handler(deps, "adminAddCreditWhitelist")({ adminSecret: "secret-key", email: " TEST@Example.COM ", note: "自测账号" }, context);
    expect(add).toMatchObject({ added: true, email: "test@example.com" });
    expect(queries[0]!.text).toContain("INSERT INTO credit_log_whitelist");
    expect(queries[0]!.values).toEqual(["test@example.com", "自测账号"]);

    const list = await handler(deps, "adminGetCreditWhitelist")({ adminSecret: "secret-key" }, context);
    expect(list).toMatchObject({ items: [{ email: "test@example.com", note: "自测", createdAt: "2026-08-16" }] });

    const remove = await handler(deps, "adminRemoveCreditWhitelist")({ adminSecret: "secret-key", email: "test@example.com" }, context);
    expect(remove).toMatchObject({ removed: true, email: "test@example.com" });
    expect(queries.at(-1)!.text).toContain("DELETE FROM credit_log_whitelist");

    await expect(handler(deps, "adminAddCreditWhitelist")({ adminSecret: "secret-key", email: "not-an-email" }, context)).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    await expect(handler(deps, "adminRemoveCreditWhitelist")({ adminSecret: "secret-key", email: "" }, context)).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });
});
