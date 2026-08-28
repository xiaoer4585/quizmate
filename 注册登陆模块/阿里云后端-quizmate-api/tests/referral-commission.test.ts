import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { REFERRAL_COMMISSION_RATE } from "../src/domain/credits.js";
import { paymentSettlementInternals } from "../src/payments/settlement.js";

function result<T extends QueryResultRow>(rows: T[] = [], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

describe("referral recharge commission", () => {
  it.each(["registered", "activated", "rewarded"])(
    "records 5%% commission when referral status is %s",
    async (status) => {
      const writes: unknown[][] = [];
      const client = {
        async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
          const normalized = sql.replace(/\s+/g, " ").trim();
          if (normalized.startsWith("SELECT referred_by FROM accounts")) {
            return result([{ referred_by: "inviter-1" }] as unknown as T[]);
          }
          if (normalized.startsWith("SELECT referral_id FROM referrals")) {
            expect(normalized).toContain("status IN ('registered','activated','rewarded')");
            expect(status).toMatch(/registered|activated|rewarded/);
            return result([{ referral_id: "ref-1" }] as unknown as T[]);
          }
          if (normalized.startsWith("SELECT commission_id FROM referral_commissions")) return result<T>();
          if (normalized.startsWith("INSERT INTO referral_commissions")) writes.push(params);
          return result<T>([], 1);
        }
      } as unknown as PoolClient;

      await paymentSettlementInternals.createReferralCommission(client, "invitee-1", `order-${status}`, "149.00", "pro");

      expect(REFERRAL_COMMISSION_RATE).toBe(0.05);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.[5]).toBe(0.05);
      expect(writes[0]?.[6]).toBe("7.45");
    }
  );

  it("does not record commission for a blocked or missing referral", async () => {
    let inserted = false;
    const client = {
      async query<T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> {
        const normalized = sql.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("SELECT referred_by FROM accounts")) {
          return result([{ referred_by: "inviter-1" }] as unknown as T[]);
        }
        if (normalized.startsWith("SELECT referral_id FROM referrals")) return result<T>();
        if (normalized.startsWith("INSERT INTO referral_commissions")) inserted = true;
        return result<T>();
      }
    } as unknown as PoolClient;

    await paymentSettlementInternals.createReferralCommission(client, "invitee-1", "order-blocked", "149.00", "pro");
    expect(inserted).toBe(false);
  });
});
