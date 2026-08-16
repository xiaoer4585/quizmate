import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createKnowledgeActions } from "../src/actions/knowledge.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

function result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class KnowledgeDb implements Database {
  writes = 0;
  knowledgeReads = 0;

  async query<T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> {
    if (/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)) this.writes += 1;
    if (/knowledge_(?:docs|chunks)/i.test(sql)) this.knowledgeReads += 1;
    if (sql.includes("FROM account_sessions")) {
      return result([{ account_id: "acc-1", status: "active" }] as unknown as T[]);
    }
    return result([] as T[]);
  }

  async connect(): Promise<PoolClient> {
    throw new Error("local-only knowledge actions must not open a transaction");
  }
}

function dependencies(db: KnowledgeDb): ActionDependencies {
  return {
    db,
    emailCodeSecret: "test",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] }),
    adminSecret: "admin-test"
  };
}

function context(db: KnowledgeDb) {
  return { requestId: "test-request", clientIp: "127.0.0.1", db };
}

describe("local-only knowledge compatibility actions", () => {
  it("returns an upload-shaped response without parsing or storing the file", async () => {
    const db = new KnowledgeDb();
    const action = createKnowledgeActions(dependencies(db)).get("uploadKnowledge")!;
    const output = await action({
      accountToken: "account-token",
      fileName: "notes.txt",
      mimeType: "text/plain",
      fileBase64: Buffer.from("private body").toString("base64")
    }, context(db)) as Record<string, unknown>;
    expect(output).toMatchObject({ localOnly: true, document: { fileName: "notes.txt", textLength: 0, chunkCount: 0, localOnly: true } });
    expect(db.writes).toBe(0);
    expect(db.knowledgeReads).toBe(0);
  });

  it("returns an empty list and compatible delete result without touching knowledge tables", async () => {
    const db = new KnowledgeDb();
    const actions = createKnowledgeActions(dependencies(db));
    await expect(actions.get("listKnowledge")!({ accountToken: "account-token" }, context(db)))
      .resolves.toMatchObject({ items: [], localOnly: true });
    await expect(actions.get("deleteKnowledge")!({ accountToken: "account-token", docId: "old-doc" }, context(db)))
      .resolves.toMatchObject({ deleted: true, document: { docId: "old-doc" }, localOnly: true });
    expect(db.writes).toBe(0);
    expect(db.knowledgeReads).toBe(0);
  });

  it("keeps administrator authentication while returning an empty page", async () => {
    const db = new KnowledgeDb();
    const action = createKnowledgeActions(dependencies(db)).get("adminListKnowledge")!;
    await expect(action({ adminSecret: "wrong" }, context(db))).rejects.toMatchObject({ code: "ADMIN_AUTH_FAILED" });
    await expect(action({ adminSecret: "admin-test" }, context(db)))
      .resolves.toMatchObject({ items: [], total: 0, totalPages: 1, localOnly: true });
    expect(db.writes).toBe(0);
  });
});
