import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES, REFERRAL_TIERED_BONUSES } from "../src/domain/credits.js";
import { referralInternals } from "../src/actions/referrals.js";
import { checkAndGrantTieredReward } from "../src/payments/settlement.js";

function result<T extends QueryResultRow>(rows: T[] = [], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

function findTier(InvitedRechargedCount: number) {
  const tier = REFERRAL_TIERED_BONUSES.find((t) => t.invitedRechargedCount === InvitedRechargedCount);
  if (!tier) throw new Error(`tier ${InvitedRechargedCount} not found`);
  return tier;
}

describe("referral tier progress (10=pro, 20=unlimited)", () => {
  it("returns no current tier and 10-pro as next when recharged count is 0", () => {
    const progress = referralInternals.buildTierProgress(0);
    expect(progress.currentTier).toBeNull();
    expect(progress.nextTier?.invitedRechargedCount).toBe(10);
    expect(progress.nextTier?.tierPackageId).toBe("pro");
  });

  it("returns 10-pro as current and 20-unlimited as next when recharged count is 15", () => {
    const progress = referralInternals.buildTierProgress(15);
    expect(progress.currentTier?.invitedRechargedCount).toBe(10);
    expect(progress.currentTier?.tierPackageId).toBe("pro");
    expect(progress.nextTier?.invitedRechargedCount).toBe(20);
    expect(progress.nextTier?.tierPackageId).toBe("unlimited");
  });

  it("returns 20-unlimited as current and null next when recharged count is 25", () => {
    const progress = referralInternals.buildTierProgress(25);
    expect(progress.currentTier?.invitedRechargedCount).toBe(20);
    expect(progress.currentTier?.tierPackageId).toBe("unlimited");
    expect(progress.nextTier).toBeNull();
  });

  it("exposes tier package id mapping (pro@10, unlimited@20)", () => {
    expect(findTier(10).tierPackageId).toBe("pro");
    expect(findTier(20).tierPackageId).toBe("unlimited");
  });
});

describe("checkAndGrantTieredReward", () => {
  function buildMockClient(opts: {
    inviterId: string | null;
    rechargedCount: number;
    existingTierKeys?: string[];
  }) {
    const { inviterId, rechargedCount, existingTierKeys = [] } = opts;
    const inserts: Array<{ sql: string; params: unknown[] }> = [];
    const updates: Array<{ sql: string; params: unknown[] }> = [];

    const client = {
      async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
        const normalized = sql.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("SELECT referred_by FROM accounts WHERE account_id")) {
          return result<T>(inviterId ? [{ referred_by: inviterId } as T] : []);
        }
        if (normalized.includes("COUNT(DISTINCT r.invitee_account_id)")) {
          return result<T>([{ recharged_count: String(rechargedCount) } as T]);
        }
        if (normalized.startsWith("INSERT INTO referral_tiered_grants")) {
          inserts.push({ sql, params });
          const tierKey = String(params[1]);
          if (existingTierKeys.includes(tierKey)) {
            return result<T>([], 0);
          }
          return result<T>([{ grant_id: "g-" + tierKey } as T]);
        }
        if (normalized.startsWith("UPDATE credit_accounts")) {
          updates.push({ sql, params });
          const credits = Number(params[1] ?? 0);
          return result<T>([{ credits: credits } as T]);
        }
        if (normalized.startsWith("INSERT INTO credit_ledger")) {
          return result<T>([], 1);
        }
        return result<T>([], 1);
      }
    } as unknown as PoolClient;
    return { client, inserts, updates };
  }

  it("does nothing when invitee has no inviter", async () => {
    const { client, inserts } = buildMockClient({ inviterId: null, rechargedCount: 25 });
    await checkAndGrantTieredReward(client, "invitee-1", "order-1");
    expect(inserts).toHaveLength(0);
  });

  it("grants only the pro tier (10=pro) at recharged count = 10", async () => {
    const proPkg = CREDIT_PACKAGES.find((p) => p.id === "pro")!;
    const expectedCredits = proPkg.baseCredits + proPkg.bonusCredits;
    const { client, inserts, updates } = buildMockClient({ inviterId: "inviter-1", rechargedCount: 10 });
    await checkAndGrantTieredReward(client, "invitee-1", "order-1");
    const tierInserts = inserts.filter((i) => i.sql.includes("INSERT INTO referral_tiered_grants"));
    const ledgerInserts = updates.filter((u) => u.sql.startsWith("UPDATE credit_accounts"));
    expect(tierInserts).toHaveLength(1);
    expect(tierInserts[0]?.params[1]).toBe("tier-10-pro");
    expect(tierInserts[0]?.params[4]).toBe(expectedCredits);
    expect(ledgerInserts).toHaveLength(1);
    expect(ledgerInserts[0]?.params[1]).toBe(expectedCredits);
  });

  it("grants both pro and unlimited at recharged count = 20", async () => {
    const proPkg = CREDIT_PACKAGES.find((p) => p.id === "pro")!;
    const ulPkg = CREDIT_PACKAGES.find((p) => p.id === "unlimited")!;
    const { client, inserts, updates } = buildMockClient({ inviterId: "inviter-1", rechargedCount: 20 });
    await checkAndGrantTieredReward(client, "invitee-1", "order-1");
    const tierInserts = inserts.filter((i) => i.sql.includes("INSERT INTO referral_tiered_grants"));
    const ledgerInserts = updates.filter((u) => u.sql.startsWith("UPDATE credit_accounts"));
    expect(tierInserts).toHaveLength(2);
    expect(tierInserts.map((t) => t.params[1]).sort()).toEqual(["tier-10-pro", "tier-20-unlimited"]);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.params[1]).toBe(proPkg.baseCredits + proPkg.bonusCredits);
    expect(updates[1]?.params[1]).toBe(ulPkg.baseCredits + ulPkg.bonusCredits);
    expect(ledgerInserts).toHaveLength(2);
  });

  it("is idempotent: 11 vs 25 should not re-grant already-paid tiers", async () => {
    const { client, inserts, updates } = buildMockClient({
      inviterId: "inviter-1",
      rechargedCount: 25,
      existingTierKeys: ["tier-10-pro", "tier-20-unlimited"]
    });
    await checkAndGrantTieredReward(client, "invitee-1", "order-1");
    const tierInserts = inserts.filter((i) => i.sql.includes("INSERT INTO referral_tiered_grants"));
    expect(tierInserts).toHaveLength(2);
    // 两行 INSERT 都返回 rowCount=0（mock 已发过），不应再 UPDATE credit_accounts
    const ledgerUpdates = updates.filter((u) => u.sql.startsWith("UPDATE credit_accounts"));
    expect(ledgerUpdates).toHaveLength(0);
  });

  it("does nothing when recharged count < 10", async () => {
    const { client, inserts } = buildMockClient({ inviterId: "inviter-1", rechargedCount: 9 });
    await checkAndGrantTieredReward(client, "invitee-1", "order-1");
    const tierInserts = inserts.filter((i) => i.sql.includes("INSERT INTO referral_tiered_grants"));
    expect(tierInserts).toHaveLength(0);
  });
});
