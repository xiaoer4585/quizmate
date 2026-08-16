import { describe, expect, it } from "vitest";
import { watchInternals } from "../src/watch/actions.js";

describe("watch compatibility helpers", () => {
  it("normalizes tracking URLs without changing the destination", () => {
    expect(watchInternals.normalizeUrl("HTTPS://Example.COM/jobs/?utm_source=test#detail"))
      .toBe("https://example.com/jobs");
  });

  it("rejects non-http monitoring sources", () => {
    expect(() => watchInternals.normalizeUrl("file:///tmp/test")).toThrow();
  });

  it("keeps the CloudBase application stage contract", () => {
    expect(watchInternals.normalizeStage("INTERVIEW")).toBe("interview");
    expect(watchInternals.stageLabel("interview")).toBe("面试");
    expect(watchInternals.normalizeStage("unknown")).toBe("applied");
  });
});
