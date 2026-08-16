import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPaths = ["001_initial.sql", "002_full_compat.sql", "003_watch_compat.sql"]
  .map((name) => resolve(process.cwd(), "migrations", name));

async function readSchema(): Promise<string> {
  return (await Promise.all(schemaPaths.map((path) => readFile(path, "utf8")))).join("\n");
}

describe("initial PostgreSQL schema", () => {
  it("contains every required business, migration, audit and idempotency table", async () => {
    const sql = await readSchema();
    const requiredTables = [
      "accounts",
      "account_sessions",
      "email_codes",
      "credit_accounts",
      "credit_ledger",
      "orders",
      "payment_events",
      "devices",
      "knowledge_docs",
      "knowledge_chunks",
      "settings",
      "usage_logs",
      "website_daily_visits",
      "legacy_licenses",
      "migration_map",
      "admin_audit_logs",
      "idempotency_keys",
      "watch_documents"
    ];
    for (const table of requiredTables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table}\\s*\\(`));
    }
  });

  it("defines the critical uniqueness and non-negative balance protections", async () => {
    const sql = await readSchema();
    expect(sql).toContain("accounts_email_unique");
    expect(sql).toContain("credit_ledger_request_unique");
    expect(sql).toContain("credit_ledger_order_unique");
    expect(sql).toContain("UNIQUE(provider, event_id)");
    expect(sql).toContain("CHECK (credits >= 0)");
    expect(sql).toContain("PRIMARY KEY(scope, request_id)");
    expect(sql).toContain("'active', 'paused', 'disabled'");
  });

  it("prevents secret-like configuration keys from being stored in settings", async () => {
    const sql = await readSchema();
    expect(sql).toContain("settings_no_secret_keys");
    expect(sql).toContain("secret|password|private.?key|api.?key");
  });
});
