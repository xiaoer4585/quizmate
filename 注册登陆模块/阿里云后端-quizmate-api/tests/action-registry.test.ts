import { describe, expect, it, vi } from "vitest";

vi.mock("../src/server.js", () => ({
  setModelFailureContext: () => undefined
}));

import { createActionRegistry } from "../src/actions/index.js";
import type { ActionDependencies } from "../src/types.js";

const cloudBaseActions = [
  "activateLicense", "adminBindLicense", "adminCreateLicenses", "adminDashboardSummary",
  "adminDeleteKnowledge", "adminGetAndroidAnswerFallbackConfig", "adminGetAnswerFormatConfig",
  "adminGetInterviewPromptConfig", "adminGetModelConfig", "adminGetPaymentConfig", "adminGetTutorialConfig", "adminListCreditAccounts",
  "adminListCreditLogs", "adminListDevices", "adminListKnowledge", "adminListLicenses", "adminListOrders",
  "adminQueryRdb", "adminResetLicense", "adminSetAndroidAnswerFallbackConfig", "adminSetAnswerFormatConfig",
  "adminSetInterviewPromptConfig", "adminSetModelConfig", "adminSetPaymentConfig", "adminSetPurchaseConfig", "adminSetTutorialConfig",
  "adminUnbindLicense", "adminWebsiteVisitTrend", "analyze", "checkLicense", "createCreditOrder",
  "createPaymentOrder", "deleteKnowledge", "getAccountProfile", "getCreditConfig", "getPaymentConfig",
  "getPurchaseConfig", "getTutorialConfig", "listKnowledge", "loginAccount", "queryCreditOrder",
  "queryPaymentOrder", "registerAccount", "resetAccountPassword", "sendRegisterCode",
  "sendResetPasswordCode", "startTrial", "trackWebsiteVisit", "uploadKnowledge", "alipayNotify",
  "payjsNotify", "epayNotify", "adminListModelCallFailures", "adminListXiaohongshuRewards",
  "adminReviewXiaohongshuReward", "submitXiaohongshuReward", "listMyXiaohongshuRewards"
];

const deps = {
  db: { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => { throw new Error("not used"); } },
  emailCodeSecret: "test",
  registerBonusCredits: 50,
  sessionTtlDays: 30,
  sendVerificationCode: async () => undefined,
  runAnalysisModel: async () => ({ items: [] }),
  payment: {
    fetch: globalThis.fetch,
    config: {
      alipay: { enabled: false, appId: "", gatewayUrl: "https://openapi.alipay.com/gateway.do", privateKey: "", publicKey: "", notifyUrl: "" },
      payjs: { enabled: false, mchId: "", key: "", nativeUrl: "https://payjs.cn/api/native", queryUrl: "https://payjs.cn/api/check", notifyUrl: "" },
      epay: { enabled: false, apiUrl: "", pid: "", key: "", notifyUrl: "", returnUrl: "" }
    }
  }
} as unknown as ActionDependencies;

describe("action registry compatibility", () => {
  it("contains every action exposed by the CloudBase studyAuthApi", () => {
    const registry = createActionRegistry(deps);
    expect(cloudBaseActions.filter((action) => !registry.has(action))).toEqual([]);
  });

  it("keeps legacy aliases for admin credit pages", () => {
    const registry = createActionRegistry(deps);
    expect([
      "adminListAccounts",
      "adminListCreditUsers",
      "adminListCreditLedger",
      "adminListCreditFlow",
      "adminListCreditFlows"
    ].filter((action) => !registry.has(action))).toEqual([]);
  });
});

