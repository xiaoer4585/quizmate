import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createConfigurationActions } from "../src/actions/configuration.js";
import type { Database } from "../src/db.js";
import type { RuntimeSetting, RuntimeSettingsStore } from "../src/services/runtime-settings.js";
import type { ActionDependencies } from "../src/types.js";

const db: Database = {
  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
  },
  async connect(): Promise<PoolClient> { throw new Error("not used"); }
};

function createHarness(initial: RuntimeSetting) {
  let stored = structuredClone(initial);
  let writes = 0;
  let lastActor = "";
  const settings = {
    async get(key: string) {
      expect(key).toBe("payment_config");
      return structuredClone(stored);
    },
    async set(key: string, value: RuntimeSetting, actor: string) {
      expect(key).toBe("payment_config");
      stored = structuredClone(value);
      lastActor = actor;
      writes += 1;
    }
  } as unknown as RuntimeSettingsStore;
  const deps = {
    db,
    adminSecret: "admin-test-secret",
    settings,
    emailCodeSecret: "email-secret",
    registerBonusCredits: 50,
    sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] })
  } as unknown as ActionDependencies;
  const actions = createConfigurationActions(deps);
  const context = { requestId: "payment-admin-test", clientIp: "127.0.0.1", db };
  return {
    get: () => actions.get("adminGetPaymentConfig")!({ adminSecret: "admin-test-secret" }, context),
    set: (input: RuntimeSetting) => actions.get("adminSetPaymentConfig")!({ adminSecret: "admin-test-secret", ...input }, context),
    stored: () => structuredClone(stored),
    writes: () => writes,
    actor: () => lastActor
  };
}

const completeEpay: RuntimeSetting = {
  epayEnabled: true,
  epayApiUrl: "https://api.niman.example/",
  epayPid: "merchant-1001",
  epayMerchantPrivateKey: "merchant-private-secret-value",
  epayPlatformPublicKey: "platform-public-secret-value",
  epayNotifyUrl: "https://api.quizmate.vip/payments/epay/notify",
  epayReturnUrl: "https://www.quizmate.vip/recharge.html"
};

describe("admin payment configuration", () => {
  it("returns only masked credential state", async () => {
    const harness = createHarness(completeEpay);
    const output = await harness.get();
    const serialized = JSON.stringify(output);
    expect(serialized).toContain("merc****alue");
    expect(serialized).toContain("plat****alue");
    expect(serialized).not.toContain("merchant-private-secret-value");
    expect(serialized).not.toContain("platform-public-secret-value");
  });

  it("preserves blank credentials while updating ordinary fields", async () => {
    const harness = createHarness(completeEpay);
    await harness.set({ epayApiUrl: "https://rotated.example/", epayMerchantPrivateKey: "", epayPlatformPublicKey: "" });
    expect(harness.stored()).toMatchObject({
      epayApiUrl: "https://rotated.example/",
      epayMerchantPrivateKey: "merchant-private-secret-value",
      epayPlatformPublicKey: "platform-public-secret-value"
    });
    expect(harness.writes()).toBe(1);
    expect(harness.actor()).toBe("admin_secret");
  });

  it("replaces credentials without returning their full values", async () => {
    const harness = createHarness(completeEpay);
    const output = await harness.set({
      epayMerchantPrivateKey: "rotated-merchant-private-key",
      epayPlatformPublicKey: "rotated-platform-public-key"
    });
    expect(harness.stored()).toMatchObject({
      epayMerchantPrivateKey: "rotated-merchant-private-key",
      epayPlatformPublicKey: "rotated-platform-public-key"
    });
    expect(JSON.stringify(output)).not.toContain("rotated-merchant-private-key");
    expect(JSON.stringify(output)).not.toContain("rotated-platform-public-key");
  });

  it("rejects incomplete enabled configuration before writing", async () => {
    const harness = createHarness({ ...completeEpay, epayEnabled: false, epayPid: "" });
    await expect(harness.set({ epayEnabled: true })).rejects.toMatchObject({ code: "EPAY_NOT_READY" });
    expect(harness.writes()).toBe(0);
    expect(harness.stored()).toMatchObject({ epayEnabled: false, epayPid: "" });
  });
});
