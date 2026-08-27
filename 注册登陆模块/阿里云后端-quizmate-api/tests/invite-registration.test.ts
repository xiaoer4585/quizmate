import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createAccountActions } from "../src/actions/accounts.js";
import type { Database } from "../src/db.js";
import { hashEmailCode } from "../src/security/crypto.js";
import type { ActionDependencies } from "../src/types.js";

function result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class RegistrationDb implements Database {
  public emailCodeReads = 0;
  public referralWrites = 0;
  public referralInviteCode = "";
  private accountId = "";

  constructor(private readonly inviterId?: string) {}

  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    return result([]) as QueryResult<T>;
  }

  async connect(): Promise<PoolClient> {
    const db = this;
    return {
      async query<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
        if (sql.includes("WHERE invite_code = $1")) {
          return result((db.inviterId ? [{ account_id: db.inviterId }] : []) as unknown as T[]);
        }
        if (sql.includes("FROM email_codes") && sql.includes("FOR UPDATE")) {
          db.emailCodeReads += 1;
          return result([{
            code_id: "code-1",
            code_hash: hashEmailCode("new@example.com", "register", "123456", "test-secret"),
            attempts: 0
          }] as unknown as T[]);
        }
        if (sql.includes("FROM accounts a JOIN credit_accounts")) {
          if (!db.accountId) return result([]) as QueryResult<T>;
          return result([{
            account_id: db.accountId,
            email: "new@example.com",
            password_salt: "salt",
            password_hash: "hash",
            status: "active",
            role: "user",
            credits: 50,
            total_charged_credits: 50,
            total_consumed_credits: 0,
            register_bonus_credits: 50,
            created_at: new Date("2026-08-15T00:00:00Z"),
            updated_at: new Date("2026-08-15T00:00:00Z"),
            last_login_at: new Date("2026-08-15T00:00:00Z")
          }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO accounts")) {
          db.accountId = String(values[0]);
          return result([], 1) as QueryResult<T>;
        }
        if (sql.includes("COUNT(*)::text AS count FROM referrals")) {
          return result([{ count: "0" }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO referrals")) {
          db.referralWrites += 1;
          db.referralInviteCode = String(values[2]);
          return result([], 1) as QueryResult<T>;
        }
        return result([], 1) as QueryResult<T>;
      },
      release() {}
    } as unknown as PoolClient;
  }
}

function register(db: RegistrationDb, inviteCode = "") {
  const dependencies: ActionDependencies = {
    db,
    emailCodeSecret: "test-secret",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] })
  } as ActionDependencies;
  const handler = createAccountActions(dependencies).get("registerAccount");
  if (!handler) throw new Error("registerAccount missing");
  return handler({ email: "new@example.com", code: "123456", password: "password-123", inviteCode }, {
    requestId: "test-request",
    clientIp: "127.0.0.1",
    db
  });
}

describe("registration invite code handling", () => {
  it("binds a real invite code while completing verified registration", async () => {
    const db = new RegistrationDb("inviter-1");
    const output = await register(db, "VALID1") as Record<string, unknown>;
    expect(output).toMatchObject({ referralStatus: "registered" });
    expect(db.emailCodeReads).toBe(1);
    expect(db.referralWrites).toBe(1);
    expect(db.referralInviteCode).toBe("VALID1");
  });

  it("allows registration without an invite code and creates no referral", async () => {
    const db = new RegistrationDb();
    const output = await register(db) as Record<string, unknown>;
    expect(output.referralStatus).toBeUndefined();
    expect(db.emailCodeReads).toBe(1);
    expect(db.referralWrites).toBe(0);
  });

  it("rejects an invalid invite code before reading or consuming the email code", async () => {
    const db = new RegistrationDb();
    await expect(register(db, "INVALID1")).rejects.toMatchObject({ code: "INVALID_INVITE_CODE" });
    expect(db.emailCodeReads).toBe(0);
    expect(db.referralWrites).toBe(0);
  });
});
