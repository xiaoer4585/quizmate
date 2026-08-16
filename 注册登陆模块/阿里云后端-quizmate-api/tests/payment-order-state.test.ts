import { describe, expect, it } from "vitest";
import { orderRefreshable, orderViewStatus } from "../src/actions/payments.js";

describe("order view status mapping", () => {
  it("maps pending states to pending", () => {
    expect(orderViewStatus("created")).toBe("pending");
    expect(orderViewStatus("waiting")).toBe("pending");
  });

  it("maps terminal states", () => {
    expect(orderViewStatus("paid")).toBe("paid");
    expect(orderViewStatus("expired")).toBe("expired");
    expect(orderViewStatus("closed")).toBe("closed");
    expect(orderViewStatus("failed")).toBe("closed");
  });

  it("treats unknown statuses as pending", () => {
    expect(orderViewStatus("unknown")).toBe("pending");
  });
});

describe("order refreshable cap", () => {
  // 60 分钟硬上限：创建起超过 60 分钟不可再刷新，必须新建订单
  const CAP_MS = 60 * 60 * 1000;
  const created = new Date("2026-07-23T10:00:00Z").toISOString();

  it("allows refresh for a pending order within the cap", () => {
    const now = new Date("2026-07-23T10:30:00Z").getTime();
    expect(orderRefreshable({ status: "waiting", created_at: created }, now)).toBe(true);
    expect(orderRefreshable({ status: "expired", created_at: created }, now)).toBe(true);
  });

  it("forbids refresh for paid/closed/failed orders regardless of time", () => {
    const now = new Date("2026-07-23T10:10:00Z").getTime();
    expect(orderRefreshable({ status: "paid", created_at: created }, now)).toBe(false);
    expect(orderRefreshable({ status: "closed", created_at: created }, now)).toBe(false);
    expect(orderRefreshable({ status: "failed", created_at: created }, now)).toBe(false);
  });

  it("forbids refresh once the hard cap is exceeded", () => {
    const now = new Date("2026-07-23T10:00:00Z").getTime() + CAP_MS + 1;
    expect(orderRefreshable({ status: "waiting", created_at: created }, now)).toBe(false);
  });

  it("forbids refresh exactly at the cap boundary (strict less-than)", () => {
    const now = new Date("2026-07-23T10:00:00Z").getTime() + CAP_MS;
    // now - createdAt === CAP_MS，严格小于判定下不再可刷新
    expect(orderRefreshable({ status: "waiting", created_at: created }, now)).toBe(false);
  });

  it("still allows refresh one ms before the cap boundary", () => {
    const now = new Date("2026-07-23T10:00:00Z").getTime() + CAP_MS - 1;
    expect(orderRefreshable({ status: "waiting", created_at: created }, now)).toBe(true);
  });

  it("handles missing created_at defensively", () => {
    const now = Date.now();
    expect(orderRefreshable({ status: "waiting", created_at: null }, now)).toBe(false);
    expect(orderRefreshable({ status: "waiting" }, now)).toBe(false);
  });
});
