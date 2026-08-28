import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { analysisInternals } from "../src/actions/analysis.js";

function result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

describe("referral activation bonus", () => {
  it("awards each side 20 credits exactly once and records both ledger entries", async () => {
    let rewarded = false;
    const balanceUpdates: Array<{ accountId: string; credits: number }> = [];
    const ledgerWrites: Array<{ accountId: string; credits: number; source: string }> = [];

    const client = {
      async query<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
        if (sql.includes("FROM referrals") && sql.includes("invitee_account_id") && sql.includes("FOR UPDATE")) {
          return result((rewarded ? [] : [{ referral_id: "ref-1", inviter_account_id: "inviter-1", status: "registered" }]) as unknown as T[]);
        }
        if (sql.includes("FROM usage_logs")) return result([{ count: "1" }] as unknown as T[]);
        if (sql.includes("status = 'rewarded'") && sql.includes("COUNT(*)")) return result([{ count: "0" }] as unknown as T[]);
        if (sql.includes("UPDATE credit_accounts")) {
          balanceUpdates.push({ accountId: String(values[0]), credits: Number(values[1]) });
          return result([{ credits: 120 }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO credit_ledger")) {
          ledgerWrites.push({
            accountId: String(values[0]),
            credits: Number(values[1]),
            source: sql.includes("referral_invitee") ? "referral_invitee" : "referral_inviter"
          });
          return result([], 1) as QueryResult<T>;
        }
        if (sql.includes("UPDATE referrals SET status = 'rewarded'")) rewarded = true;
        return result([], 1) as QueryResult<T>;
      }
    } as unknown as PoolClient;

    const awardedBalance = await analysisInternals.tryActivateReferral(client, "invitee-1");
    const duplicateBalance = await analysisInternals.tryActivateReferral(client, "invitee-1");

    expect(balanceUpdates).toEqual([
      { accountId: "invitee-1", credits: 20 },
      { accountId: "inviter-1", credits: 20 }
    ]);
    expect(ledgerWrites).toEqual([
      { accountId: "invitee-1", credits: 20, source: "referral_invitee" },
      { accountId: "inviter-1", credits: 20, source: "referral_inviter" }
    ]);
    expect(rewarded).toBe(true);
    expect(awardedBalance).toBe(120);
    expect(duplicateBalance).toBeNull();
  });
});
