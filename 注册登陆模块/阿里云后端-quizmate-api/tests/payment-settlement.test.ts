import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { Database } from "../src/db.js";
import type { PaymentRuntimeConfig } from "../src/payments/config.js";
import { settlePaymentCallback } from "../src/payments/settlement.js";
import { signEpayParams } from "../src/payments/signatures.js";

function result<T extends QueryResultRow>(rows: T[] = [], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

const config: PaymentRuntimeConfig = {
  alipay: { enabled: false, appId: "", gatewayUrl: "https://openapi.alipay.com/gateway.do", privateKey: "", publicKey: "", notifyUrl: "" },
  payjs: { enabled: false, mchId: "", key: "payjs-secret", nativeUrl: "https://payjs.cn/api/native", queryUrl: "https://payjs.cn/api/check", notifyUrl: "" },
  epay: { enabled: true, apiUrl: "https://pay.example.com", pid: "1001", key: "epay-secret", notifyUrl: "https://api.example.com/payments/epay/notify", returnUrl: "https://www.quizmate.vip/recharge.html" }
};

class FakePaymentDb implements Database {
  connects = 0;
  creditWrites = 0;
  ledgerWrites = 0;
  orderPaidWrites = 0;
  readonly events = new Set<string>();
  status = "waiting";

  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    return result<T>();
  }

  async connect(): Promise<PoolClient> {
    this.connects += 1;
    const db = this;
    return {
      async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
        if (sql.includes("FROM orders") && sql.includes("FOR UPDATE")) {
          return result([{
            out_trade_no: "CR001", provider: "epay", order_type: "credits", account_id: "acc-1",
            status: db.status, amount: "49.90", total_credits: 560, package_id: "trial"
          }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO payment_events")) {
          const eventId = String(values?.[1] ?? "");
          if (db.events.has(eventId)) return result<T>([], 0);
          db.events.add(eventId);
          return result<T>([], 1);
        }
        if (sql.includes("UPDATE credit_accounts")) {
          db.creditWrites += 1;
          return result([{ credits: 660 }] as unknown as T[]);
        }
        if (sql.includes("INSERT INTO credit_ledger")) db.ledgerWrites += 1;
        if (sql.includes("UPDATE orders") && sql.includes("status = 'paid'")) {
          db.orderPaidWrites += 1;
          db.status = "paid";
        }
        return result<T>([], 1);
      },
      release() {}
    } as unknown as PoolClient;
  }
}

function epayPayload(overrides: Record<string, string> = {}) {
  const payload: Record<string, string> = {
    pid: "1001",
    trade_no: "EP001",
    out_trade_no: "CR001",
    type: "alipay",
    name: "QuizMate",
    money: "49.90",
    trade_status: "TRADE_SUCCESS",
    param: "acc-1",
    ...overrides
  };
  payload.sign = signEpayParams(payload, config.epay.key);
  payload.sign_type = "MD5";
  return payload;
}

describe("payment callback settlement", () => {
  it("settles a paid credit order exactly once", async () => {
    const db = new FakePaymentDb();
    const first = await settlePaymentCallback(db, config, "epay", epayPayload());
    const second = await settlePaymentCallback(db, config, "epay", epayPayload());
    expect(first).toMatchObject({ accepted: true, settled: true, duplicate: false });
    expect(second).toMatchObject({ accepted: true, settled: false, duplicate: true });
    expect(db.creditWrites).toBe(1);
    expect(db.ledgerWrites).toBe(1);
    expect(db.orderPaidWrites).toBe(1);
  });

  it("rejects an exact amount mismatch without crediting", async () => {
    const db = new FakePaymentDb();
    const outcome = await settlePaymentCallback(db, config, "epay", epayPayload({ money: "49.89", trade_no: "EP002" }));
    expect(outcome).toMatchObject({ accepted: false, reason: "amount_mismatch" });
    expect(db.creditWrites).toBe(0);
    expect(db.ledgerWrites).toBe(0);
  });

  it("settles a later success after an earlier non-success notification", async () => {
    const db = new FakePaymentDb();
    const waiting = await settlePaymentCallback(db, config, "epay", epayPayload({ trade_status: "WAIT_BUYER_PAY" }));
    const paid = await settlePaymentCallback(db, config, "epay", epayPayload());
    expect(waiting).toMatchObject({ accepted: true, settled: false, reason: "non_success_status" });
    expect(paid).toMatchObject({ accepted: true, settled: true });
    expect(db.creditWrites).toBe(1);
    expect(db.ledgerWrites).toBe(1);
  });

  it("does not credit an already-paid order when a different valid event arrives", async () => {
    const db = new FakePaymentDb();
    db.status = "paid";
    const outcome = await settlePaymentCallback(db, config, "epay", epayPayload({ trade_no: "EP004" }));
    expect(outcome).toMatchObject({ accepted: true, settled: false, reason: "already_paid" });
    expect(db.creditWrites).toBe(0);
    expect(db.ledgerWrites).toBe(0);
  });

  it("rejects an account reference mismatch without crediting", async () => {
    const db = new FakePaymentDb();
    const outcome = await settlePaymentCallback(db, config, "epay", epayPayload({ param: "acc-other", trade_no: "EP003" }));
    expect(outcome).toMatchObject({ accepted: false, reason: "account_mismatch" });
    expect(db.creditWrites).toBe(0);
  });

  it("does not open a transaction for an invalid signature", async () => {
    const db = new FakePaymentDb();
    const payload = epayPayload();
    payload.sign = "bad";
    const outcome = await settlePaymentCallback(db, config, "epay", payload);
    expect(outcome).toMatchObject({ accepted: false, reason: "invalid_signature" });
    expect(db.connects).toBe(0);
  });
});
