import crypto from "node:crypto";

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_BYTES = 32;

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "";
  return email;
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_BYTES, "sha256").toString("hex");
}

export function createPasswordRecord(password: string): { passwordSalt: string; passwordHash: string } {
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  return { passwordSalt, passwordHash: hashPassword(password, passwordSalt) };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!salt || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createAccountToken(): string {
  return `acct_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashToken(token: unknown): string {
  const normalized = String(token ?? "").trim();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function hashEmailCode(email: string, purpose: string, code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${email}\n${purpose}\n${code}`, "utf8").digest("hex");
}

export function randomEmailCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}
