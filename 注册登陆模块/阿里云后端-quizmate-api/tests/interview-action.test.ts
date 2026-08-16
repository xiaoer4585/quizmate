import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildInterviewPrompt, createSpeechActions } from "../src/actions/speech.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

const unusedDb = {
  query: async () => { throw new Error("unexpected query"); },
  connect: async () => { throw new Error("unexpected connection"); }
} as unknown as Database;

const dependencies = {
  db: unusedDb,
  emailCodeSecret: "test-secret",
  registerBonusCredits: 50,
  sessionTtlDays: 30,
  sendVerificationCode: async () => undefined,
  runAnalysisModel: async () => ({ items: [] })
} as unknown as ActionDependencies;

function queryResult<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

describe("interview speech action", () => {
  const context = {
    position: "Product Manager",
    company: "Example Inc.",
    resumeText: "Led a cross-functional product launch.",
    language: "zh",
    answerStyle: "concise" as const
  };

  it("selects the response language from the question and explicit instructions", () => {
    expect(buildInterviewPrompt("请介绍一下自己", context)).toContain("本次回答语言（必须遵守）：中文");
    expect(buildInterviewPrompt("Tell me about yourself", context)).toContain("本次回答语言（必须遵守）：English");
    expect(buildInterviewPrompt("请用英文介绍一下你自己", context)).toContain("本次回答语言（必须遵守）：English");
  });

  it("keeps the configured prompt and interview context", () => {
    const prompt = buildInterviewPrompt("Why this role?", context, "CUSTOM INTERVIEW ROLE");
    expect(prompt).toContain("CUSTOM INTERVIEW ROLE");
    expect(prompt).toContain("应聘岗位：Product Manager");
    expect(prompt).toContain("目标公司：Example Inc.");
    expect(prompt).toContain("候选人简历：\nLed a cross-functional product launch.");
  });

  it("registers the interview answer action", () => {
    expect(createSpeechActions(dependencies).has("generateInterviewAnswer")).toBe(true);
  });

  it("requires an authenticated account", async () => {
    const handler = createSpeechActions(dependencies).get("generateInterviewAnswer");
    if (!handler) throw new Error("generateInterviewAnswer missing");
    await expect(handler({ question: "请介绍一下自己" }, {
      requestId: "test-request",
      clientIp: "127.0.0.1",
      db: unusedDb
    })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("calls the model and charges 30 credits after a successful answer", async () => {
    const writes: Array<{ sql: string; values?: unknown[] }> = [];
    const db = {
      query: async <T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> => {
        if (sql.includes("FROM account_sessions")) {
          return queryResult([{
            account_id: "account-1",
            status: "active",
            credits: 100
          }] as unknown as T[]);
        }
        return queryResult([] as T[]);
      },
      connect: async () => ({
        query: async <T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> => {
          writes.push({ sql, values });
          if (sql.includes("SELECT c.credits")) {
            return queryResult([{ credits: 100, status: "active" }] as unknown as T[]);
          }
          return queryResult([] as T[], 1);
        },
        release: vi.fn()
      } as unknown as PoolClient)
    } as unknown as Database;
    const runAnalysisModel = vi.fn(async () => ({
      items: [{
        summary: "自我介绍",
        answer: "我会围绕岗位匹配度介绍自己的经历。",
        explanation: "岗位匹配\n关键经历"
      }]
    }));
    const deps = { ...dependencies, db, runAnalysisModel } as ActionDependencies;
    const handler = createSpeechActions(deps).get("generateInterviewAnswer");
    if (!handler) throw new Error("generateInterviewAnswer missing");

    const result = await handler({
      accountToken: "valid-token",
      question: "请介绍一下自己",
      context: { position: "产品经理", answerStyle: "concise" }
    }, {
      requestId: "http-request",
      clientIp: "127.0.0.1",
      db
    });

    expect(runAnalysisModel).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      answer: "我会围绕岗位匹配度介绍自己的经历。",
      keyPoints: ["岗位匹配", "关键经历"],
      creditCost: 30,
      creditBalance: 70
    });
    expect(writes.some(({ sql, values }) =>
      sql.includes("INSERT INTO credit_ledger")
      && values?.[1] === -30
      && String(values?.[3]).startsWith("interview_")
    )).toBe(true);
    expect(writes.some(({ sql }) => sql.includes("INSERT INTO usage_logs"))).toBe(true);
  });
});
