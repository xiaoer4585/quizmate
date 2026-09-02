import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createActivityActions } from "../src/actions/activities.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

function result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class ActivityDb implements Database {
  awarded = 0;
  ledger = 0;

  async query<T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> {
    if (sql.includes("FROM account_sessions")) return result([{ account_id: "account-1", email: "user@example.com", status: "active" }] as unknown as T[]);
    if (sql.includes("INSERT INTO xiaohongshu_reward_claims")) return result([{ claim_id: "claim-1", account_id: "account-1", product: "resume_autofill", note_url: "https://www.xiaohongshu.com/explore/abc", like_count: 70, favorite_count: 2, tier: 70, reward_credits: 2500, proof_data_url: "data:image/png;base64,AA==", proof_name: "proof.png", status: "pending", submitted_at: new Date("2026-08-30T00:00:00Z") }] as unknown as T[]);
    return result([]) as QueryResult<T>;
  }

  async connect(): Promise<PoolClient> {
    const db = this;
    return {
      async query<T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> {
        if (sql.includes("require_admin") || sql.includes("FROM account_sessions")) return result([]) as QueryResult<T>;
        if (sql.includes("FROM xiaohongshu_reward_claims") && sql.includes("FOR UPDATE")) return result([{ claim_id: "claim-1", account_id: "account-1", status: "pending", reward_credits: 600 }] as unknown as T[]);
        if (sql.includes("UPDATE credit_accounts")) { db.awarded += 600; return result([{ credits: 700 }] as unknown as T[]); }
        if (sql.includes("INSERT INTO credit_ledger")) db.ledger += 1;
        if (sql.includes("UPDATE xiaohongshu_reward_claims")) return result([{ claim_id: "claim-1", account_id: "account-1", status: "approved", reward_credits: 600 }] as unknown as T[]);
        return result([], 1) as QueryResult<T>;
      },
      release() {}
    } as unknown as PoolClient;
  }
}

function dependencies(db: ActivityDb): ActionDependencies {
  return { db, config: {} as ActionDependencies["config"], emailCodeSecret: "test", registerBonusCredits: 50, sessionTtlDays: 30, adminSecret: "secret", sendVerificationCode: async () => undefined, runAnalysisModel: async () => ({ items: [] }), runStructuredModel: async () => ({}) };
}

describe("xiaohongshu rewards", () => {
  it("accepts a resume claim at the 70 interaction tier", async () => {
    const db = new ActivityDb();
    const submit = createActivityActions(dependencies(db)).get("submitXiaohongshuReward")!;
    const output = await submit({ token: "user-token", product: "resume_autofill", noteUrl: "https://www.xiaohongshu.com/explore/abc?share=1", likeCount: 70, favoriteCount: 2, proofDataUrl: "data:image/png;base64,AA==", proofName: "proof.png" }, { requestId: "http-1", clientIp: "127.0.0.1", db }) as Record<string, unknown>;
    expect(output).toMatchObject({ id: "claim-1", tier: 70, rewardCredits: 2500, product: "resume_autofill" });
  });

  it("rejects submissions below the minimum tier", async () => {
    const db = new ActivityDb();
    const submit = createActivityActions(dependencies(db)).get("submitXiaohongshuReward")!;
    await expect(submit({ token: "user-token", noteUrl: "https://www.xiaohongshu.com/explore/abc", likeCount: 19, favoriteCount: 3, proofDataUrl: "data:image/png;base64,AA==" }, { requestId: "http-2", clientIp: "127.0.0.1", db })).rejects.toMatchObject({ code: "REWARD_TIER_NOT_MET" });
  });

  it("awards credits and writes one shared ledger row on approval", async () => {
    const db = new ActivityDb();
    const review = createActivityActions(dependencies(db)).get("adminReviewXiaohongshuReward")!;
    await review({ adminSecret: "secret", claimId: "claim-1", decision: "approved" }, { requestId: "http-3", clientIp: "127.0.0.1", db });
    expect(db.awarded).toBe(600);
    expect(db.ledger).toBe(1);
  });
});
