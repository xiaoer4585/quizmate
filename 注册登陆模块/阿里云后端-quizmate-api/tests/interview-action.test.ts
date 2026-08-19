import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildInterviewPrompt, createSpeechActions, formatInterviewAnswer } from "../src/actions/speech.js";
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
    jobDescription: "Own product strategy and launch cross-functional initiatives.",
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
    expect(prompt).toContain("岗位描述：\nOwn product strategy and launch cross-functional initiatives.");
    expect(prompt).toContain("候选人简历：\nLed a cross-functional product launch.");
  });

  it("prioritizes resume evidence for self-introduction", () => {
    const prompt = buildInterviewPrompt("请介绍下你自己", context);
    expect(prompt).toContain("这是自我介绍问题");
    expect(prompt).toContain("优先从候选人简历提取真实经历");
  });

  it("requires a concise pyramid answer with numbered support and no separate key-point field", () => {
    const prompt = buildInterviewPrompt("请说说你如何推进跨团队项目", context);
    expect(prompt).toContain("金字塔原理");
    expect(prompt).toContain("1、2、3");
    expect(prompt).toContain('"explanation":""');
    expect(prompt).not.toContain("回答要点，每个要点单独一行");
  });

  it("requires the two-layer answer structure with divider and position-expert persona", () => {
    const logicPrompt = buildInterviewPrompt("给定一个字符串流，如何实现滑动窗口求最长不重复子串长度", context);
    expect(logicPrompt).toContain("答题思路");
    expect(logicPrompt).toContain("详细回答");
    expect(logicPrompt).toContain("----------");
    expect(logicPrompt).toContain("资深专家");
    // 逻辑题先思路后详细回答，常规面试问题顺序相反（由提示词约束模型自适应）
    expect(logicPrompt).toContain("先输出【答题思路】再输出【详细回答】");
    expect(logicPrompt).toContain("先输出【详细回答】");
    expect(logicPrompt).toContain("应聘岗位：Product Manager");
    expect(logicPrompt).toContain("【详细回答】给出简洁、自然、可直接口述的回答");
  });

  it("keeps the conclusion and numbered support in readable paragraphs", () => {
    expect(formatInterviewAnswer("我会先明确目标。 1、统一口径。 2、拆解责任。 3、跟踪复盘。"))
      .toBe("我会先明确目标。\n\n1、统一口径。\n\n2、拆解责任。\n\n3、跟踪复盘。");
    expect(formatInterviewAnswer("结论\n- 第一项\n- 第二项\n- 第三项"))
      .toBe("结论\n\n1、第一项\n\n2、第二项\n\n3、第三项");
  });

  it("preserves the two-layer divider and section headers when formatting", () => {
    expect(formatInterviewAnswer(
      "【答题思路】\n第一步 定位题型\n第二步 给出框架\n----------\n【详细回答】\n我的结论。 1、支撑点一。 2、支撑点二。"
    )).toBe(
      "【答题思路】\n\n第一步 定位题型\n第二步 给出框架\n\n----------\n\n【详细回答】\n\n我的结论。\n\n1、支撑点一。\n\n2、支撑点二。"
    );
    // 模型输出不同长度的横线分隔符时统一规范，且不再被当作项目符号吞噬
    expect(formatInterviewAnswer("结论A\n-------------\n结论B"))
      .toBe("结论A\n\n----------\n\n结论B");
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

  it("calls the model and charges 20 credits after a successful answer", async () => {
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
      keyPoints: [],
      creditCost: 20,
      creditBalance: 80
    });
    expect(writes.some(({ sql, values }) =>
      sql.includes("INSERT INTO credit_ledger")
      && values?.[1] === -20
      && String(values?.[3]).startsWith("interview_")
    )).toBe(true);
    expect(writes.some(({ sql }) => sql.includes("INSERT INTO usage_logs"))).toBe(true);
  });

  it("processes the same question twice as two independent model calls and settlements", async () => {
    let balance = 100;
    const ledgerRequestIds: string[] = [];
    const db = {
      query: async <T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> => {
        if (sql.includes("FROM account_sessions")) {
          return queryResult([{ account_id: "account-repeat", status: "active", credits: balance }] as unknown as T[]);
        }
        return queryResult([] as T[]);
      },
      connect: async () => ({
        query: async <T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> => {
          if (sql.includes("SELECT c.credits")) {
            return queryResult([{ credits: balance, status: "active" }] as unknown as T[]);
          }
          if (sql.includes("UPDATE credit_accounts")) balance = Number(values?.[1]);
          if (sql.includes("INSERT INTO credit_ledger")) ledgerRequestIds.push(String(values?.[3]));
          return queryResult([] as T[], 1);
        },
        release: vi.fn()
      } as unknown as PoolClient)
    } as unknown as Database;
    const runAnalysisModel = vi.fn(async () => ({
      items: [{ summary: "重复问题", answer: "结论。 1、第一点。 2、第二点。 3、第三点。", explanation: "" }]
    }));
    const handler = createSpeechActions({ ...dependencies, db, runAnalysisModel } as ActionDependencies)
      .get("generateInterviewAnswer");
    if (!handler) throw new Error("generateInterviewAnswer missing");
    const input = { accountToken: "valid-token", question: "请介绍一下自己" };
    const requestContext = { requestId: "same-question", clientIp: "127.0.0.1", db };

    const first = await handler(input, requestContext);
    const second = await handler(input, requestContext);

    expect(runAnalysisModel).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({ creditCost: 20, creditBalance: 80 });
    expect(second).toMatchObject({ creditCost: 20, creditBalance: 60 });
    expect(ledgerRequestIds).toHaveLength(2);
    expect(new Set(ledgerRequestIds).size).toBe(2);
  });
});
