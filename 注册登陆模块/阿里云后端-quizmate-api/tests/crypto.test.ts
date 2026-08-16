import { describe, expect, it } from "vitest";
import {
  createAccountToken,
  createPasswordRecord,
  hashEmailCode,
  hashToken,
  normalizeEmail,
  verifyPassword
} from "../src/security/crypto.js";

describe("account security primitives", () => {
  it("normalizes valid email and rejects malformed input", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmail("not-an-email")).toBe("");
    expect(normalizeEmail("a".repeat(250) + "@x.test")).toBe("");
  });

  it("keeps migrated PBKDF2 password behavior and uses timing-safe verification", () => {
    const record = createPasswordRecord("correct horse battery staple");
    expect(record.passwordSalt).toMatch(/^[a-f0-9]{32}$/);
    expect(record.passwordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPassword("correct horse battery staple", record.passwordSalt, record.passwordHash)).toBe(true);
    expect(verifyPassword("wrong", record.passwordSalt, record.passwordHash)).toBe(false);
    expect(verifyPassword("wrong", record.passwordSalt, "malformed")).toBe(false);
  });

  it("creates opaque account tokens and stores only deterministic hashes", () => {
    const token = createAccountToken();
    expect(token).toMatch(/^acct_[a-f0-9]{64}$/);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken("")).toBe("");
  });

  it("binds verification code hashes to email, purpose and server secret", () => {
    const first = hashEmailCode("a@example.com", "register", "123456", "secret-a");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(hashEmailCode("a@example.com", "register", "123456", "secret-a")).toBe(first);
    expect(hashEmailCode("b@example.com", "register", "123456", "secret-a")).not.toBe(first);
    expect(hashEmailCode("a@example.com", "reset_password", "123456", "secret-a")).not.toBe(first);
    expect(hashEmailCode("a@example.com", "register", "123456", "secret-b")).not.toBe(first);
  });
});
