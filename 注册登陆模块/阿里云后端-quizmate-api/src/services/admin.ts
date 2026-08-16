import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";

export function requireAdmin(expectedSecret: string | undefined, suppliedSecret: unknown): void {
  const expected = String(expectedSecret ?? "");
  const supplied = String(suppliedSecret ?? "");
  if (!expected || !supplied) throw new PublicError("管理员密钥不正确。", "ADMIN_AUTH_FAILED", 403);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new PublicError("管理员密钥不正确。", "ADMIN_AUTH_FAILED", 403);
  }
}

export async function requireAdminByToken(client: PoolClient, accountToken: unknown): Promise<{ accountId: string; email: string }> {
  const tokenHash = hashToken(accountToken);
  if (!tokenHash) throw new PublicError("请先登录账户。", "AUTH_REQUIRED", 401);
  
  const result = await client.query<{ account_id: string; email: string; role: string; status: string }>(
    `SELECT a.account_id, a.email, a.role, a.status
       FROM account_sessions s
       JOIN accounts a USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status !== "active") throw new PublicError("该账户已停用，请联系管理员。", "ACCOUNT_DISABLED", 403);
  if (account.role !== "admin") throw new PublicError("该账户没有管理员权限。", "ADMIN_AUTH_FAILED", 403);
  
  await client.query("UPDATE account_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash]);
  
  return { accountId: account.account_id, email: account.email };
}

export function maskSecret(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

