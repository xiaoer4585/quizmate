import { describe, expect, it } from "vitest";
import { epayQuerySettlementPayload } from "../src/actions/payments.js";
import { verifyEpayParams } from "../src/payments/signatures.js";

describe("EPay order query reconciliation", () => {
  it("converts a confirmed provider query into a verifiable settlement payload", () => {
    const payload = epayQuerySettlementPayload(
      { code: 1, status: 1, trade_no: "EP-QUERY-1", money: "49.90", buyer: "buyer-1" },
      { out_trade_no: "CR001", amount: "49.90", subject: "QuizMate 积分" },
      "acc-1",
      "1001",
      "epay-secret"
    );

    expect(payload).toMatchObject({
      pid: "1001",
      out_trade_no: "CR001",
      trade_no: "EP-QUERY-1",
      trade_status: "TRADE_SUCCESS",
      money: "49.90",
      param: "acc-1",
      sign_type: "MD5"
    });
    expect(verifyEpayParams(payload, "epay-secret")).toBe(true);
  });

  it("falls back to the immutable order amount when the provider omits money", () => {
    const payload = epayQuerySettlementPayload(
      { code: 1, trade_status: "TRADE_SUCCESS", trade_no: "EP-QUERY-2" },
      { out_trade_no: "CR002", amount: "99.00", subject: "QuizMate 积分" },
      "acc-2",
      "1001",
      "epay-secret"
    );

    expect(payload.money).toBe("99.00");
    expect(verifyEpayParams(payload, "epay-secret")).toBe(true);
  });
});
