import { describe, expect, it } from "vitest";
import { createSiteEngineActions, siteEngineInternals } from "../src/actions/site-engine.js";

const context = { requestId: "site-engine-test", clientIp: "127.0.0.1", db: {} as never };

function dependencies() {
  return {
    config: {}, emailCodeSecret: "test", registerBonusCredits: 50, sessionTtlDays: 30,
    sendVerificationCode: async () => undefined,
    runAnalysisModel: async () => ({ items: [] }), runStructuredModel: async () => ({}),
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM account_sessions")) return { rows: [{ status: "active" }], rowCount: 1 };
        if (sql.includes("FROM resume_site_configs")) return { rows: [{ config: { strategies: { clickInner: true }, adapterRegistry: { generic: { mappings: [{ key: "fullName", pattern: "姓名" }] } } } }], rowCount: 1 };
        if (sql.includes("FROM resume_engine_patches")) return { rows: [{ id: "1", patch: { strategies: { confirmButton: true } }, version: "2", note: "hot" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
    }
  } as never;
}

describe("server-managed resume site engine", () => {
  it("keeps only declarative rule keys and supports adapter registry overrides", () => {
    expect(siteEngineInternals.sanitizeConfig({ adapterRegistry: { generic: {} }, selectors: { option: ["[role=option]"] }, executableCode: "alert(1)" })).toEqual({ adapterRegistry: { generic: {} }, selectors: { option: ["[role=option]"] } });
  });

  it("merges enabled JSON hot rules without returning executable code", async () => {
    const handler = createSiteEngineActions(dependencies()).get("getSiteEngineConfig")!;
    const result = await handler({ accountToken: "session-token", hostname: "https://jobs.example.com/apply" }, context) as Record<string, unknown>;
    expect(result).toMatchObject({ siteConfig: { strategies: { clickInner: true, confirmButton: true } } });
    expect(JSON.stringify(result)).not.toContain("code");
  });
});
