import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createPaymentActions } from "../src/actions/payments.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

const db: Database = {
  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
  },
  async connect(): Promise<PoolClient> { throw new Error("not used"); }
};

const deps: ActionDependencies = {
  db,
  emailCodeSecret: "email-secret",
  registerBonusCredits: 50,
  sessionTtlDays: 30,
  sendVerificationCode: async () => undefined,
  runAnalysisModel: async () => ({ items: [] }),
  payment: {
    fetch: globalThis.fetch,
    config: {
      alipay: { enabled: true, appId: "app-id", gatewayUrl: "https://openapi.alipay.com/gateway.do", privateKey: "private-secret", publicKey: "public-secret", notifyUrl: "https://api.example.com/payments/alipay/notify" },
      payjs: { enabled: true, mchId: "mch-id", key: "payjs-secret", nativeUrl: "https://payjs.cn/api/native", queryUrl: "https://payjs.cn/api/check", notifyUrl: "https://api.example.com/payments/payjs/notify" },
      epay: { enabled: true, apiUrl: "https://pay.example.com", pid: "1001", key: "epay-secret", notifyUrl: "https://api.example.com/payments/epay/notify", returnUrl: "https://www.quizmate.vip/recharge.html" }
    }
  }
};

describe("public payment config", () => {
  it("exposes readiness and packages without any credential values", async () => {
    const handler = createPaymentActions(deps).get("getPaymentConfig");
    if (!handler) throw new Error("getPaymentConfig missing");
    const output = await handler({}, { requestId: "r1", clientIp: "127.0.0.1", db });
    const text = JSON.stringify(output);
    expect(text).toContain("creditPackages");
    expect(text).not.toContain("private-secret");
    expect(text).not.toContain("public-secret");
    expect(text).not.toContain("payjs-secret");
    expect(text).not.toContain("epay-secret");
  });
});
