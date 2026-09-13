import { describe, expect, it } from "vitest";
import { createAccountActions } from "../src/actions/accounts.js";
import type { Database } from "../src/db.js";
import type { ActionDependencies } from "../src/types.js";

const unusedDb = {
  query: async () => { throw new Error("unexpected query"); },
  connect: async () => { throw new Error("unexpected connection"); }
} as unknown as Database;

const dependencies: ActionDependencies = {
  db: unusedDb,
  emailCodeSecret: "test-secret",
  registerBonusCredits: 50,
  sessionTtlDays: 30,
  sendVerificationCode: async () => undefined,
  runAnalysisModel: async () => ({ items: [] })
};

describe("account action registry", () => {
  it("exposes legacy account actions and the new session/device actions", () => {
    const actions = createAccountActions(dependencies);
    expect([...actions.keys()].sort()).toEqual([
      "getAccountProfile",
      "listAccountDevices",
      "loginAccount",
      "logoutAccount",
      "logoutAllAccountDevices",
      "refreshAccountSession",
      "registerAccount",
      "resetAccountPassword",
      "revokeAccountDevice",
      "sendRegisterCode",
      "sendResetPasswordCode"
    ]);
  });

  it("rejects invalid registration input before opening a database connection", async () => {
    const handler = createAccountActions(dependencies).get("registerAccount");
    if (!handler) throw new Error("registerAccount missing");
    await expect(handler({ email: "bad", password: "short" }, {
      requestId: "http", clientIp: "127.0.0.1", db: unusedDb
    })).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });
});
