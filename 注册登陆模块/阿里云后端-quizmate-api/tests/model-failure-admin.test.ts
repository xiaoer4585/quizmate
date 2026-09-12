import { describe, expect, it } from "vitest";
import { createAdminActions } from "../src/actions/admin.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

function deps(db: Database): ActionDependencies {
  return { db, config: {} as ActionDependencies["config"], emailCodeSecret: "test", registerBonusCredits: 50, sessionTtlDays: 30, sendVerificationCode: async () => undefined, runAnalysisModel: async () => ({ items: [] }), adminSecret: "secret" };
}

function database(handler: (text: string, values: unknown[]) => { rows: Record<string, unknown>[]; rowCount: number }) {
  const queries: { text: string; values: unknown[] }[] = [];
  const db = {
    query: async (text: string, values: unknown[] = []) => { queries.push({ text, values }); return handler(text, values); },
    connect: async () => ({ query: async (text: string, values: unknown[] = []) => { queries.push({ text, values }); return handler(text, values); }, release: () => undefined })
  } as unknown as Database;
  return { db, queries };
}

const context = { requestId: "test", clientIp: "127.0.0.1", db: undefined as never };

describe("AI failure admin controls", () => {
  it("adds the whitelist predicate to failure listing", async () => {
    const { db, queries } = database((text) => text.includes("count(*)") ? { rows: [{ count: "0" }], rowCount: 1 } : { rows: [], rowCount: 0 });
    await createAdminActions(deps(db)).get("adminListModelCallFailures")!({ adminSecret: "secret", excludeWhitelist: true }, context);
    expect(queries.some((query) => query.text.includes("model_failure_whitelist"))).toBe(true);
  });

  it("deletes selected failure IDs in one transaction", async () => {
    const { db, queries } = database((text) => text.includes("DELETE FROM model_call_failures") ? { rows: [{ failure_id: 4 }, { failure_id: 9 }], rowCount: 2 } : { rows: [], rowCount: 0 });
    const result = await createAdminActions(deps(db)).get("adminDeleteModelCallFailures")!({ adminSecret: "secret", failureIds: [4, "9", 4] }, context);
    expect(result).toMatchObject({ deleted: 2, failureIds: [4, 9] });
    expect(queries.map((query) => query.text)).toEqual(expect.arrayContaining(["BEGIN", expect.stringContaining("DELETE FROM model_call_failures"), expect.stringContaining("admin_audit_logs"), "COMMIT"]));
  });
});
