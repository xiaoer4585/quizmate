import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createAnalysisActions } from "../src/actions/analysis.js";
import type { Database } from "../src/db.js";
import { PublicError } from "../src/errors.js";
import type { ActionDependencies, AnalysisModelResult } from "../src/types.js";

function queryResult<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class FakeAnalysisDb implements Database {
  public ledgerWrites = 0;
  public usageWrites = 0;
  public connected = 0;
  public failedMarks = 0;
  public reservationScope = "";
  public settlementScope = "";
  public knowledgeQueries = 0;
  private lastDigest = "";

  constructor(
    private readonly credits: number,
    private readonly reservation: "new" | "completed" | "conflict" = "new"
  ) {}

  async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
    if (sql.includes("FROM account_sessions")) {
      return queryResult([{ account_id: "acc-1", email: "a@example.com", status: "active", credits: this.credits }] as unknown as T[]);
    }
    if (sql.includes("INSERT INTO idempotency_keys")) {
      this.reservationScope = String(values?.[0] ?? "");
      this.lastDigest = String(values?.[3] ?? "");
      return queryResult([], this.reservation === "new" ? 1 : 0) as QueryResult<T>;
    }
    if (sql.includes("SELECT status, request_digest") && sql.includes("idempotency_keys")) {
      const digest = this.reservation === "conflict" ? "different" : this.lastDigest;
      return queryResult([{
        status: "completed",
        request_digest: digest,
        response_body: { items: [{ summary: "题目1", answer: "A", explanation: "ok" }], creditBalance: 90 },
        locked_until: null
      }] as unknown as T[]);
    }
    if (sql.includes("knowledge_chunks") || sql.includes("knowledge_docs")) {
      this.knowledgeQueries += 1;
      return queryResult([]) as QueryResult<T>;
    }
    if (sql.includes("UPDATE idempotency_keys") && sql.includes("status = 'failed'")) {
      this.failedMarks += 1;
      return queryResult([], 1) as QueryResult<T>;
    }
    if (sql.includes("INSERT INTO usage_logs")) {
      this.usageWrites += 1;
      return queryResult([], 1) as QueryResult<T>;
    }
    return queryResult([], 1) as QueryResult<T>;
  }

  async connect(): Promise<PoolClient> {
    this.connected += 1;
    const db = this;
    const client = {
      async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
        if (sql.includes("SELECT status, request_digest") && sql.includes("FOR UPDATE")) {
          db.settlementScope = String(values?.[0] ?? "");
          return queryResult([{ status: "processing", request_digest: "digest", response_body: null, locked_until: new Date() }] as unknown as T[]);
        }
        if (sql.includes("SELECT c.credits") && sql.includes("FOR UPDATE")) {
          return queryResult([{ credits: db.credits, status: "active" }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO credit_ledger")) db.ledgerWrites += 1;
        if (sql.includes("INSERT INTO usage_logs")) db.usageWrites += 1;
        return queryResult([], 1) as QueryResult<T>;
      },
      release() {}
    };
    return client as unknown as PoolClient;
  }
}

function dependencies(db: FakeAnalysisDb, model: () => Promise<AnalysisModelResult>): ActionDependencies {
  return {
    db,
    emailCodeSecret: "test-secret",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: model
  };
}

function analyze(deps: ActionDependencies) {
  const handler = createAnalysisActions(deps).get("analyze");
  if (!handler) throw new Error("analyze action missing");
  return handler;
}

const validResult: AnalysisModelResult = {
  items: [{ summary: "题目1", answer: "A", explanation: "学习解析" }]
};

describe("analysis credit and idempotency guards", () => {
  it("rejects insufficient balance before reserving or invoking the model", async () => {
    const db = new FakeAnalysisDb(5);
    const model = vi.fn(async () => validResult);
    await expect(analyze(dependencies(db, model))({ token: "acct_test", requestId: "request-0001" }, {
      requestId: "http-1", clientIp: "127.0.0.1", db
    })).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(model).not.toHaveBeenCalled();
    expect(db.connected).toBe(0);
    expect(db.ledgerWrites).toBe(0);
  });

  it("does not open a credit transaction when the model fails", async () => {
    const db = new FakeAnalysisDb(100);
    const model = vi.fn(async () => { throw new PublicError("timeout", "MODEL_TIMEOUT", 504); });
    await expect(analyze(dependencies(db, model))({ token: "acct_test", requestId: "request-0002", prompt: "练习题" }, {
      requestId: "http-2", clientIp: "127.0.0.1", db
    })).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    expect(model).toHaveBeenCalledTimes(1);
    expect(db.connected).toBe(0);
    expect(db.ledgerWrites).toBe(0);
    expect(db.failedMarks).toBe(1);
    expect(db.usageWrites).toBe(1);
  });

  it("settles a successful model result with one ledger entry", async () => {
    const db = new FakeAnalysisDb(100);
    const model = vi.fn(async () => validResult);
    const output = await analyze(dependencies(db, model))({ token: "acct_test", requestId: "request-0003", prompt: "练习题" }, {
      requestId: "http-3", clientIp: "127.0.0.1", db
    }) as Record<string, unknown>;
    expect(output).toMatchObject({ creditCost: 10, creditBalance: 90, usedKnowledge: false, knowledgeHits: [] });
    expect(model).toHaveBeenCalledTimes(1);
    expect(db.connected).toBe(1);
    expect(db.settlementScope).toBe(db.reservationScope);
    expect(db.ledgerWrites).toBe(1);
    expect(db.usageWrites).toBe(1);
    expect(db.knowledgeQueries).toBe(0);
  });

  it("returns the completed response without invoking the model again", async () => {
    const db = new FakeAnalysisDb(100, "completed");
    const model = vi.fn(async () => validResult);
    const handler = analyze(dependencies(db, model));
    const input = { token: "acct_test", requestId: "request-0004", prompt: "练习题" };
    const context = { requestId: "http-4", clientIp: "127.0.0.1", db };
    const output = await handler(input, context) as Record<string, unknown>;
    expect(output).toMatchObject({ creditBalance: 90, replayed: true });
    expect(model).not.toHaveBeenCalled();
    expect(db.connected).toBe(0);
  });
});
