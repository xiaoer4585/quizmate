import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createResumeActions, RESUME_CREDIT_COSTS, resumeInternals } from "../src/actions/resume.js";
import type { Database } from "../src/db.js";
import { PublicError } from "../src/errors.js";
import type { ActionDependencies } from "../src/types.js";

function result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class ResumeDb implements Database {
  ledger = 0;
  usage = 0;
  failed = 0;
  private digest = "";

  constructor(private credits = 100, private replay = false) {}

  async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
    if (sql.includes("FROM account_sessions")) return result([{ account_id: "acc-1", email: "resume@example.com", status: "active", credits: this.credits }] as unknown as T[]);
    if (sql.includes("INSERT INTO idempotency_keys")) {
      this.digest = String(values?.[3] ?? "");
      return result([], this.replay ? 0 : 1) as QueryResult<T>;
    }
    if (sql.includes("SELECT status, request_digest") && sql.includes("idempotency_keys")) {
      return result([{ status: "completed", request_digest: this.digest, response_body: { plan: [{ fieldId: "f1", value: "张三" }], creditBalance: 85 }, locked_until: null }] as unknown as T[]);
    }
    if (sql.includes("status = 'failed'")) this.failed += 1;
    if (sql.includes("INSERT INTO usage_logs")) this.usage += 1;
    return result([], 1) as QueryResult<T>;
  }

  async connect(): Promise<PoolClient> {
    const db = this;
    return {
      async query<T extends QueryResultRow>(sql: string): Promise<QueryResult<T>> {
        if (sql.includes("idempotency_keys") && sql.includes("FOR UPDATE")) return result([{ status: "processing", request_digest: "x", response_body: null, locked_until: new Date() }] as unknown as T[]);
        if (sql.includes("SELECT c.credits") && sql.includes("FOR UPDATE")) return result([{ credits: db.credits, status: "active" }] as unknown as T[]);
        if (sql.includes("INSERT INTO credit_ledger")) db.ledger += 1;
        if (sql.includes("INSERT INTO usage_logs")) db.usage += 1;
        if (sql.includes("SELECT referral_id")) return result([]) as QueryResult<T>;
        return result([], 1) as QueryResult<T>;
      },
      release() {}
    } as unknown as PoolClient;
  }
}

function deps(db: ResumeDb, model = vi.fn(async () => ({ plan: [{ fieldId: "field-1", value: "张三", confidence: 0.98 }] }))): ActionDependencies {
  return {
    db,
    config: {} as ActionDependencies["config"],
    emailCodeSecret: "test",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] }),
    runStructuredModel: model
  };
}

describe("resume autofill shared credit actions", () => {
  it("publishes the required action costs", () => {
    expect(RESUME_CREDIT_COSTS).toEqual({ parseAutofillProfile: 0, aiFillForm: 0, optimizeAutofillProfile: 0 });
  });

  it("normalizes a bounded executable fill plan", () => {
    expect(resumeInternals.normalizePlan({ plan: [{ id: "a", value: "v", confidence: 2 }, { nope: true }] })).toEqual({ plan: [{ fieldId: "a", value: "v", confidence: 1 }] });
  });

  it("resolves semantic select labels before using a model", () => {
    expect(resumeInternals.localOptionIndex([
      { label: "请选择", value: "" },
      { label: "男性", value: "M" },
      { label: "女性", value: "F" }
    ], "女", "性别")).toBe(2);
    expect(resumeInternals.localOptionIndex([
      { label: "中国大陆 +86", value: "86" },
      { label: "美国 +1", value: "1" }
    ], "+8613800000000", "手机区号")).toBe(0);
  });

  it("keeps broad basic fields and separate experience rows from canonical or Chinese model keys", () => {
    const output = resumeInternals.normalizeProfile({ profile: {
      basic: { name: "张三", age: "24", phone: "13800000000", email: "z@example.com", idType: "居民身份证", idNumber: "110101199001010011", nationality: "中国", nativePlace: "江苏南京", currentCity: "上海", householdRegistration: "江苏南京", gaokaoOrigin: "江苏", address: "上海市浦东新区", politicalStatus: "中共党员", isFreshGraduate: "是", github: "https://github.com/test" },
      skills: { englishLevel: "CET-6", englishScore: "610", technical: "Java, SQL" },
      educations: [{ school: "A University", major: "Computer Science", degree: "Master", startDate: "2022-09", endDate: "2025-06" }, { 学校名称: "B University", 专业: "Finance", 学历层次: "本科" }],
      internships: [{ company: "Acme", position: "Data Intern", description: "Built dashboards" }, { 公司名称: "Beta", 职位名称: "Product Intern", 工作内容: "User research" }]
    } });
    expect(output).toMatchObject({ recognizedFieldCount: expect.any(Number) });
    const profile = output.profile as Record<string, any>;
    expect(profile.basic).toMatchObject({ name: "张三", age: "24", idType: "居民身份证", idNumber: "110101199001010011", currentCity: "上海", github: "https://github.com/test" });
    expect(profile.educations).toHaveLength(2);
    expect(profile.educations[1]).toMatchObject({ school: "B University", major: "Finance", level: "本科" });
    expect(profile.internships).toHaveLength(2);
    expect(profile.internships[1]).toMatchObject({ company: "Beta", position: "Product Intern" });
    expect((output.nonEmptyPaths as string[]).some((path) => path === "basic.phone")).toBe(true);
  });

  it("does not count empty schema fields as recognized", () => {
    const output = resumeInternals.normalizeProfile({ profile: { basic: { name: "", email: "" }, educations: [{}] } });
    expect(output.recognizedFieldCount).toBe(0);
    expect(output.nonEmptyPaths).toEqual([]);
  });

  it("keeps the balance unchanged for permanently free resume autofill", async () => {
    const db = new ResumeDb(100);
    const handler = createResumeActions(deps(db)).get("aiFillForm")!;
    const output = await handler({ token: "token", requestId: "fill-request-1", fields: [{ fieldId: "field-1", label: "姓名" }], profile: { basic: { name: "张三" } } }, { requestId: "http-1", clientIp: "127.0.0.1", db }) as Record<string, unknown>;
    expect(output).toMatchObject({ creditCost: 0, creditBalance: 100 });
    expect(db.ledger).toBe(0);
    expect(db.usage).toBe(1);
  });

  it("routes visual form planning through the configured image model", async () => {
    const db = new ResumeDb(100);
    const model = vi.fn(async () => ({ plan: [{ fieldId: "gender", value: "女" }] }));
    const handler = createResumeActions(deps(db, model)).get("aiFillForm")!;
    const screenshot = "data:image/png;base64,ZmFrZS1zY3JlZW5zaG90";
    await handler(
      { token: "token", requestId: "fill-visual-1", fields: [{ fieldId: "gender", label: "性别", controlType: "select" }], profile: { basic: { gender: "女" } }, screenshot },
      { requestId: "http-visual-1", clientIp: "127.0.0.1", db }
    );
    expect(model).toHaveBeenCalledWith(expect.objectContaining({ mode: "resume_fill", images: [screenshot] }));
  });

  it("does not deduct when the structured model fails", async () => {
    const db = new ResumeDb(100);
    const model = vi.fn(async () => { throw new PublicError("timeout", "MODEL_TIMEOUT", 504); });
    const handler = createResumeActions(deps(db, model)).get("aiFillForm")!;
    await expect(handler({ token: "token", requestId: "fill-request-2", fields: [], profile: {} }, { requestId: "http-2", clientIp: "127.0.0.1", db })).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    expect(db.ledger).toBe(0);
    expect(db.failed).toBe(1);
  });

  it("replays a completed request without calling the model", async () => {
    const db = new ResumeDb(100, true);
    const model = vi.fn(async () => ({ plan: [] }));
    const handler = createResumeActions(deps(db, model)).get("aiFillForm")!;
    const output = await handler({ token: "token", requestId: "fill-request-3", fields: [], profile: {} }, { requestId: "http-3", clientIp: "127.0.0.1", db }) as Record<string, unknown>;
    expect(output).toMatchObject({ creditBalance: 85, replayed: true });
    expect(model).not.toHaveBeenCalled();
  });
});
