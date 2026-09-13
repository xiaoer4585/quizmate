import { describe, expect, it } from "vitest";
import { createAccountActions } from "../src/actions/accounts.js";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { vi } from "vitest";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

const unusedDb = {
  query: async () => { throw new Error("unexpected query"); },
  connect: async () => { throw new Error("unexpected connection"); }
} as unknown as Database;

const dependencies: ActionDependencies = {
  db: unusedDb,
  emailCodeSecret: "test-secret",
  registerBonusCredits: 50,
  sessionTtlDays: 30,
  sendVerificationCode: async () => undefined,
  runAnalysisModel: async () => ({ items: [] })
};

describe("account action registry", () => {
  it("exposes legacy account actions and the new session/device actions", () => {
    const actions = createAccountActions(dependencies);
    expect([...actions.keys()].sort()).toEqual([
      "getAccountProfile",
      "getCreditLedger",
      "listAccountDevices",
      "loginAccount",
      "logoutAccount",
      "logoutAllAccountDevices",
      "refreshAccountSession",
      "registerAccount",
      "resetAccountPassword",
      "revokeAccountDevice",
      "sendRegisterCode",
      "sendResetPasswordCode"
    ]);
  });

  it("lists only the authenticated account's credit ledger", async () => {
    const query = async <T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> => {
      if (sql.includes("FROM account_sessions")) return { rows: [{ account_id: "account-1", session_id: "session-1", email: "a@example.com", status: "active", role: "user", credits: 80, total_charged_credits: 100, total_consumed_credits: 20, register_bonus_credits: 50, created_at: new Date(), updated_at: new Date(), last_login_at: null }] as unknown as T[], rowCount: 1, command: "", oid: 0, fields: [] };
      if (sql.includes("count(*)")) return { rows: [{ count: "1" }] as unknown as T[], rowCount: 1, command: "", oid: 0, fields: [] };
      return { rows: [{ log_id: "log-1", operation_type: "consume", credits: -20, balance_after: 80, source: "interview", service_type: "study_ai", order_no: null, reason: null, created_at: new Date("2026-09-13T00:00:00Z") }] as unknown as T[], rowCount: 1, command: "", oid: 0, fields: [] };
    };
    const db = { query, connect: async () => ({ query, release: vi.fn() } as unknown as PoolClient) } as unknown as Database;
    const handler = createAccountActions({ ...dependencies, db }).get("getCreditLedger");
    if (!handler) throw new Error("getCreditLedger missing");
    const result = await handler({ accountToken: "valid-token", accountId: "other-account" }, { requestId: "test", clientIp: "127.0.0.1", db });
    expect(result).toMatchObject({ accountId: "account-1", total: 1, creditBalance: 80 });
    expect((result as { records: Array<{ id: string }> }).records[0].id).toBe("log-1");
  });

  it("rejects invalid registration input before opening a database connection", async () => {
    const handler = createAccountActions(dependencies).get("registerAccount");
    if (!handler) throw new Error("registerAccount missing");
    await expect(handler({ email: "bad", password: "short" }, {
      requestId: "http", clientIp: "127.0.0.1", db: unusedDb
    })).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });
});
