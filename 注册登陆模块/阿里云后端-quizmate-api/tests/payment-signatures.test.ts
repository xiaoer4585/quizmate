import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAlipaySignContent,
  buildEpaySignContent,
  buildPayjsSignContent,
  signEpayParams,
  signPayjsParams,
  verifyAlipayParams,
  verifyEpayParams,
  verifyPayjsParams
} from "../src/payments/signatures.js";

describe("payment signatures", () => {
  it("matches the legacy Epay MD5 canonicalization", () => {
    const params = { trade_status: "TRADE_SUCCESS", sign_type: "MD5", out_trade_no: "CR001", money: "49.90", pid: "1001" };
    expect(buildEpaySignContent(params, "secret")).toBe("money=49.90&out_trade_no=CR001&pid=1001&trade_status=TRADE_SUCCESSsecret");
    const sign = signEpayParams(params, "secret");
    expect(verifyEpayParams({ ...params, sign: sign.toUpperCase() }, "secret")).toBe(true);
    expect(verifyEpayParams({ ...params, money: "0.01", sign }, "secret")).toBe(false);
  });

  it("matches the legacy PAYJS uppercase MD5 canonicalization", () => {
    const params = { out_trade_no: "PAY001", total_fee: "4990", return_code: "1" };
    expect(buildPayjsSignContent(params, "secret")).toBe("out_trade_no=PAY001&return_code=1&total_fee=4990&key=secret");
    const sign = signPayjsParams(params, "secret");
    expect(sign).toBe(sign.toUpperCase());
    expect(verifyPayjsParams({ ...params, sign }, "secret")).toBe(true);
  });

  it("verifies Alipay RSA2 and excludes only sign/action", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const params = { app_id: "app1", out_trade_no: "PAY001", total_amount: "49.90", trade_status: "TRADE_SUCCESS", sign_type: "RSA2" };
    expect(buildAlipaySignContent(params)).toContain("sign_type=RSA2");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(buildAlipaySignContent(params), "utf8");
    signer.end();
    const sign = signer.sign(privateKey, "base64");
    const exported = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyAlipayParams({ ...params, sign }, exported)).toBe(true);
    expect(verifyAlipayParams({ ...params, total_amount: "0.01", sign }, exported)).toBe(false);
  });
});
