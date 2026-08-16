import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { Queryable } from "../src/db.js";

const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 8100,
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://unused",
  CORS_ORIGINS: "https://www.quizmate.vip",
  TRUST_PROXY: false,
  BODY_LIMIT_BYTES: 6 * 1024 * 1024,
  RATE_LIMIT_MAX: 120,
  RATE_LIMIT_WINDOW: "1 minute",
  MODEL_API_PATH: "/v1/chat/completions",
  IMAGE_MODEL_API_PATH: "/v1/chat/completions",
  SMTP_PORT: 465,
  corsOrigins: ["https://www.quizmate.vip"]
};

function fakeDb(ok = true): Queryable {
  return {
    query: async () => {
      if (!ok) throw new Error("database unavailable");
      return { rows: [{ ok: 1 }], rowCount: 1 } as never;
    }
  };
}

describe("quizmate api shell", () => {
  it("returns healthy without exposing configuration", async () => {
    const app = await buildApp(config, { db: fakeDb(), actions: new Map(), version: "test" });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", database: "ok", version: "test" });
    expect(response.body).not.toContain("postgresql://");
    await app.close();
  });

  it("reports a degraded database without leaking the error", async () => {
    const app = await buildApp(config, { db: fakeDb(false), actions: new Map(), version: "test" });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", database: "unavailable" });
    expect(response.body).not.toContain("database unavailable");
    await app.close();
  });

  it("keeps the legacy action envelope and rejects unknown actions", async () => {
    const app = await buildApp(config, { db: fakeDb(), actions: new Map(), version: "test" });
    const response = await app.inject({ method: "POST", url: "/study-auth-api", payload: { action: "missing" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, code: "UNKNOWN_ACTION", error: "未知操作。" });
    await app.close();
  });

  it("allows configured website CORS and rejects other origins", async () => {
    const app = await buildApp(config, { db: fakeDb(), actions: new Map(), version: "test" });
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/",
      headers: { origin: "https://www.quizmate.vip", "access-control-request-method": "POST" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://www.quizmate.vip");
    const denied = await app.inject({
      method: "OPTIONS",
      url: "/",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("returns the provider plaintext contract on the dedicated callback path", async () => {
    const actions = new Map([["epayNotify", async () => ({ accepted: true, settled: true })]]);
    const app = await buildApp(config, { db: fakeDb(), actions, version: "test" });
    const response = await app.inject({
      method: "POST",
      url: "/payments/epay/notify",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "out_trade_no=CR001&trade_status=TRADE_SUCCESS&sign=ok"
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toBe("success");
    await app.close();
  });

  it("keeps the legacy action callback as a plaintext response", async () => {
    const actions = new Map([["epayNotify", async () => ({ accepted: true, duplicate: true })]]);
    const app = await buildApp(config, { db: fakeDb(), actions, version: "test" });
    const response = await app.inject({
      method: "POST",
      url: "/study-auth-api",
      payload: { pid: "1001", out_trade_no: "CR001", trade_status: "TRADE_SUCCESS", sign: "ok" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toBe("success");
    await app.close();
  });
});
