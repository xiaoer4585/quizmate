import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { PublicError } from "../errors.js";
import { CREDIT_COST_PER_SUCCESS } from "../domain/credits.js";
import {
  createAccountToken,
  createPasswordRecord,
  hashEmailCode,
  hashToken,
  normalizeEmail,
  randomEmailCode,
  verifyPassword
} from "../security/crypto.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

type Purpose = "register" | "reset_password";

interface AccountRow {
  account_id: string;
  email: string;
  password_salt: string;
  password_hash: string;
  status: string;
  role: string;
  credits: string | number;
  total_charged_credits: string | number;
  total_consumed_credits: string | number;
  register_bonus_credits: number;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at: Date | string | null;
}

function requirePassword(input: ActionInput): string {
  const password = String(input.password ?? input.newPassword ?? "");
  if (password.length < 8 || password.length > 128) throw new PublicError("密码至少需要 8 位。", "INVALID_PASSWORD");
  return password;
}

function publicAccount(account: AccountRow) {
  return {
    accountId: account.account_id,
    email: account.email,
    credits: Number(account.credits),
    totalChargedCredits: Number(account.total_charged_credits),
    totalConsumedCredits: Number(account.total_consumed_credits),
    isOldUser: Number(account.total_charged_credits) > 0,
    registerBonusCredits: Number(account.register_bonus_credits),
    status: account.status,
    role: account.role || "user",
    createdAt: new Date(account.created_at).toISOString(),
    updatedAt: new Date(account.updated_at).toISOString(),
    lastLoginAt: account.last_login_at ? new Date(account.last_login_at).toISOString() : ""
  };
}

async function transaction<T>(deps: ActionDependencies, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await deps.db.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findAccountByEmail(client: PoolClient, email: string, lock = false): Promise<AccountRow | undefined> {
  const result = await client.query<AccountRow>(
    `SELECT a.*, c.credits, c.total_charged_credits, c.total_consumed_credits
       FROM accounts a JOIN credit_accounts c USING(account_id)
      WHERE a.email = $1${lock ? " FOR UPDATE OF a, c" : ""}`,
    [email]
  );
  return result.rows[0];
}

async function resolveInviterId(client: PoolClient, inviteCode: string): Promise<string | undefined> {
  if (!inviteCode) return undefined;
  const result = await client.query<{ account_id: string }>(
    "SELECT account_id FROM accounts WHERE invite_code = $1",
    [inviteCode]
  );
  const inviterId = result.rows[0]?.account_id;
  if (!inviterId) throw new PublicError("邀请码无效，请检查后重试或留空。", "INVALID_INVITE_CODE");
  return inviterId;
}

async function verifyCode(
  client: PoolClient,
  deps: ActionDependencies,
  email: string,
  purpose: Purpose,
  rawCode: unknown
): Promise<string> {
  const code = String(rawCode ?? "").trim();
  if (!/^\d{6}$/.test(code)) throw new PublicError("请输入有效验证码。", "INVALID_EMAIL_CODE");
  const result = await client.query<{
    code_id: string;
    code_hash: string;
    attempts: number;
  }>(
    `SELECT code_id, code_hash, attempts
       FROM email_codes
      WHERE email = $1 AND purpose = $2 AND status = 'active' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [email, purpose]
  );
  const record = result.rows[0];
  if (!record) throw new PublicError("验证码已失效，请重新获取。", "EMAIL_CODE_EXPIRED");
  const expected = hashEmailCode(email, purpose, code, deps.emailCodeSecret);
  const valid = /^[a-f0-9]{64}$/i.test(record.code_hash)
    && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(record.code_hash, "hex"));
  if (!valid) {
    const attempts = Number(record.attempts) + 1;
    await client.query(
      "UPDATE email_codes SET attempts = $2, status = CASE WHEN $2 >= 5 THEN 'locked' ELSE status END WHERE code_id = $1",
      [record.code_id, attempts]
    );
    throw new PublicError("验证码不正确。", "INVALID_EMAIL_CODE");
  }
  return record.code_id;
}

function createSessionExpiry(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function insertSession(client: PoolClient, deps: ActionDependencies, accountId: string, input: ActionInput) {
  const token = createAccountToken();
  const deviceId = String(input.deviceId ?? "").trim().slice(0, 200);
  if (deviceId) {
    await client.query(
      "UPDATE account_sessions SET revoked_at = now() WHERE account_id = $1 AND device_id = $2 AND revoked_at IS NULL",
      [accountId, deviceId]
    );
  }
  const expiresAt = createSessionExpiry(deps.sessionTtlDays);
  await client.query(
    `INSERT INTO account_sessions(account_id, token_hash, device_id, platform, app_version, expires_at)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6)`,
    [
      accountId,
      hashToken(token),
      deviceId,
      String(input.platform ?? "").trim().slice(0, 50),
      String(input.appVersion ?? "").trim().slice(0, 50),
      expiresAt
    ]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function requireAccount(client: PoolClient, input: ActionInput): Promise<AccountRow & { session_id: string }> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录积分账户。", "AUTH_REQUIRED", 401);
  const result = await client.query<AccountRow & { session_id: string }>(
    `SELECT a.*, c.credits, c.total_charged_credits, c.total_consumed_credits, s.session_id
       FROM account_sessions s
       JOIN accounts a USING(account_id)
       JOIN credit_accounts c USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status === "disabled") throw new PublicError("该账户已停用，请联系管理员。", "ACCOUNT_DISABLED", 403);
  await client.query("UPDATE account_sessions SET last_seen_at = now() WHERE session_id = $1", [account.session_id]);
  return account;
}

function sendCodeHandler(deps: ActionDependencies, purpose: Purpose): ActionHandler {
  return async (input) => {
    if (!deps.emailCodeSecret) throw new PublicError("验证码服务尚未配置。", "EMAIL_CODE_NOT_CONFIGURED", 503);
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效邮箱。", "INVALID_EMAIL");

    const existing = await deps.db.query<{ account_id: string }>("SELECT account_id FROM accounts WHERE email = $1", [email]);
    if (purpose === "register" && existing.rowCount) throw new PublicError("该邮箱已经注册，请直接登录。", "ACCOUNT_EXISTS");
    if (purpose === "reset_password" && !existing.rowCount) throw new PublicError("该邮箱尚未注册。", "ACCOUNT_NOT_FOUND");

    const latest = await deps.db.query<{ created_at: Date | string; expires_at: Date | string }>(
      `SELECT created_at, expires_at FROM email_codes
        WHERE email = $1 AND purpose = $2 AND status = 'active'
        ORDER BY created_at DESC LIMIT 1`,
      [email, purpose]
    );
    const record = latest.rows[0];
    if (record) {
      const age = Math.floor((Date.now() - new Date(record.created_at).getTime()) / 1000);
      if (age >= 0 && age < 60 && new Date(record.expires_at).getTime() > Date.now()) {
        return { email, expiresIn: Math.max(1, Math.floor((new Date(record.expires_at).getTime() - Date.now()) / 1000)), cooldown: 60 - age, reused: true, message: "验证码已发送，请勿重复点击。" };
      }
    }

    const code = randomEmailCode();
    const codeId = crypto.randomUUID();
    await deps.db.query(
      `INSERT INTO email_codes(code_id, email, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [codeId, email, purpose, hashEmailCode(email, purpose, code, deps.emailCodeSecret)]
    );
    try {
      await deps.sendVerificationCode(email, code, purpose);
    } catch (error) {
      await deps.db.query("UPDATE email_codes SET status = 'expired' WHERE code_id = $1", [codeId]);
      throw error;
    }
    return { email, expiresIn: 600, cooldown: 60, message: "验证码已发送，请查收邮箱。" };
  };
}

function registerHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效邮箱。", "INVALID_EMAIL");
    const password = requirePassword(input);
    const inviteCode = String(input.inviteCode ?? input.ref ?? "").trim().toUpperCase();
    const deviceId = String(input.deviceId ?? "").trim().slice(0, 200);
    return transaction(deps, async (client) => {
      const inviterId = await resolveInviterId(client, inviteCode);
      const codeId = await verifyCode(client, deps, email, "register", input.code ?? input.emailCode);
      if (await findAccountByEmail(client, email, true)) throw new PublicError("该邮箱已经注册，请直接登录。", "ACCOUNT_EXISTS");
      const accountId = crypto.randomUUID();
      const passwordRecord = createPasswordRecord(password);
      await client.query(
        `INSERT INTO accounts(account_id, email, password_salt, password_hash, register_bonus_credits, last_login_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [accountId, email, passwordRecord.passwordSalt, passwordRecord.passwordHash, deps.registerBonusCredits]
      );
      await client.query(
        `INSERT INTO credit_accounts(account_id, credits, total_charged_credits)
         VALUES ($1, $2, $2)`,
        [accountId, deps.registerBonusCredits]
      );
      if (deps.registerBonusCredits > 0) {
        await client.query(
          `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source)
           VALUES ($1, 'register_bonus', $2, $2, 'website_register')`,
          [accountId, deps.registerBonusCredits]
        );
      }

      // 邀请码绑定：查找邀请人并创建邀请关系
      let referralStatus = "";
      if (inviteCode && inviterId) {
        // 检查邀请人是否已达上限
        const countResult = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM referrals WHERE inviter_account_id = $1 AND status <> 'device_blocked'",
          [inviterId]
        );
        const invitedCount = Number(countResult.rows[0]?.count ?? 0);
        const MAX_REFERRAL = 50;

        let status = "registered";
        let isDeviceBlocked = false;

        // 同设备检查：邀请人是否在同一设备注册过
        if (deviceId) {
          const deviceCheck = await client.query<{ account_id: string }>(
            `SELECT a.account_id FROM devices d
                JOIN accounts a ON d.account_id = a.account_id
               WHERE d.device_id = $1 AND a.account_id = $2 AND d.revoked_at IS NULL
               LIMIT 1`,
            [deviceId, inviterId]
          );
          const existingDeviceReferral = await client.query(
            "SELECT referral_id FROM referrals WHERE inviter_account_id = $1 AND device_id = $2",
            [inviterId, deviceId]
          );
          if (deviceCheck.rows.length > 0 || existingDeviceReferral.rows.length > 0) {
            status = "device_blocked";
            isDeviceBlocked = true;
          }
        }

        if (invitedCount >= MAX_REFERRAL && !isDeviceBlocked) status = "registered";

        await client.query(
          `INSERT INTO referrals(inviter_account_id, invitee_account_id, invite_code, status, device_id, registered_at)
             VALUES ($1, $2, $3, $4, NULLIF($5, ''), now())`,
          [inviterId, accountId, inviteCode, status, deviceId]
        );
        await client.query(
          "UPDATE accounts SET referred_by = $2 WHERE account_id = $1",
          [accountId, inviterId]
        );

        if (isDeviceBlocked) {
          await client.query(
            `INSERT INTO referral_risk_flags(referral_id, risk_type, detail)
               VALUES (currval('referrals_referral_id_seq'::regclass), 'same_device', $1)`,
            [`邀请人与被邀请人使用同一设备 ${deviceId}`]
          );
        }
        referralStatus = status;
      }

      await client.query("UPDATE email_codes SET status = 'used', used_at = now() WHERE code_id = $1", [codeId]);
      const session = await insertSession(client, deps, accountId, input);
      const account = await findAccountByEmail(client, email);
      if (!account) throw new Error("registered account missing");
      return {
        account: publicAccount(account),
        token: session.token,
        expiresAt: session.expiresAt,
        referralStatus: referralStatus || undefined
      };
    });
  };
}

function loginHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const email = normalizeEmail(input.email);
    const password = String(input.password ?? "");
    if (!email || !password) throw new PublicError("请输入邮箱和密码。", "INVALID_CREDENTIALS");
    return transaction(deps, async (client) => {
      const account = await findAccountByEmail(client, email, true);
      if (!account || !verifyPassword(password, account.password_salt, account.password_hash)) {
        throw new PublicError("邮箱或密码不正确。", "INVALID_CREDENTIALS", 401);
      }
      if (account.status === "disabled") throw new PublicError("该账户已停用，请联系管理员。", "ACCOUNT_DISABLED", 403);
      const session = await insertSession(client, deps, account.account_id, input);
      await client.query("UPDATE accounts SET last_login_at = now(), updated_at = now() WHERE account_id = $1", [account.account_id]);
      const updated = { ...account, last_login_at: new Date(), updated_at: new Date() };
      return { account: publicAccount(updated), token: session.token, expiresAt: session.expiresAt };
    });
  };
}

function profileHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      return { account: publicAccount(account), costPerSuccess: CREDIT_COST_PER_SUCCESS };
    } finally {
      client.release();
    }
  };
}

function resetPasswordHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const email = normalizeEmail(input.email);
    if (!email) throw new PublicError("请输入有效邮箱。", "INVALID_EMAIL");
    const password = requirePassword(input);
    return transaction(deps, async (client) => {
      const codeId = await verifyCode(client, deps, email, "reset_password", input.code ?? input.emailCode);
      const account = await findAccountByEmail(client, email, true);
      if (!account) throw new PublicError("该邮箱尚未注册。", "ACCOUNT_NOT_FOUND");
      const record = createPasswordRecord(password);
      await client.query(
        "UPDATE accounts SET password_salt = $2, password_hash = $3, updated_at = now() WHERE account_id = $1",
        [account.account_id, record.passwordSalt, record.passwordHash]
      );
      await client.query("UPDATE account_sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL", [account.account_id]);
      await client.query("UPDATE email_codes SET status = 'used', used_at = now() WHERE code_id = $1", [codeId]);
      return { reset: true };
    });
  };
}

function logoutHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const tokenHash = hashToken(input.accountToken ?? input.token);
    if (!tokenHash) return { loggedOut: true };
    await deps.db.query("UPDATE account_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash]);
    return { loggedOut: true };
  };
}

function refreshSessionHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => transaction(deps, async (client) => {
    const account = await requireAccount(client, input);
    const token = createAccountToken();
    const expiresAt = createSessionExpiry(deps.sessionTtlDays);
    await client.query(
      `UPDATE account_sessions SET token_hash = $2, last_seen_at = now(), expires_at = $3
        WHERE session_id = $1 AND revoked_at IS NULL`,
      [account.session_id, hashToken(token), expiresAt]
    );
    return { account: publicAccount(account), token, expiresAt: expiresAt.toISOString() };
  });
}

function listDevicesHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      const result = await client.query<{
        session_id: string;
        device_id: string | null;
        platform: string | null;
        app_version: string | null;
        created_at: Date | string;
        last_seen_at: Date | string;
        expires_at: Date | string | null;
      }>(
        `SELECT session_id, device_id, platform, app_version, created_at, last_seen_at, expires_at
           FROM account_sessions WHERE account_id = $1 AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > now()) ORDER BY last_seen_at DESC`,
        [account.account_id]
      );
      return {
        devices: result.rows.map((row) => ({
          sessionId: row.session_id,
          deviceId: row.device_id ?? "",
          platform: row.platform ?? "",
          appVersion: row.app_version ?? "",
          createdAt: new Date(row.created_at).toISOString(),
          lastSeenAt: new Date(row.last_seen_at).toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : "",
          current: row.session_id === account.session_id
        }))
      };
    } finally {
      client.release();
    }
  };
}

function revokeDeviceHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => transaction(deps, async (client) => {
    const account = await requireAccount(client, input);
    const sessionId = String(input.sessionId ?? "").trim();
    if (!sessionId) throw new PublicError("请选择要撤销的设备。", "MISSING_SESSION_ID");
    const result = await client.query(
      `UPDATE account_sessions SET revoked_at = now()
        WHERE session_id = $1 AND account_id = $2 AND revoked_at IS NULL`,
      [sessionId, account.account_id]
    );
    if (!result.rowCount) throw new PublicError("设备会话不存在或已撤销。", "SESSION_NOT_FOUND", 404);
    return { revoked: true, sessionId, currentSessionRevoked: sessionId === account.session_id };
  });
}

function logoutAllHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => transaction(deps, async (client) => {
    const account = await requireAccount(client, input);
    await client.query(
      "UPDATE account_sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
      [account.account_id]
    );
    return { loggedOutAll: true };
  });
}

export function createAccountActions(deps: ActionDependencies): Map<string, ActionHandler> {
  return new Map([
    ["sendRegisterCode", sendCodeHandler(deps, "register")],
    ["sendResetPasswordCode", sendCodeHandler(deps, "reset_password")],
    ["registerAccount", registerHandler(deps)],
    ["loginAccount", loginHandler(deps)],
    ["getAccountProfile", profileHandler(deps)],
    ["resetAccountPassword", resetPasswordHandler(deps)],
    ["logoutAccount", logoutHandler(deps)],
    ["refreshAccountSession", refreshSessionHandler(deps)],
    ["listAccountDevices", listDevicesHandler(deps)],
    ["revokeAccountDevice", revokeDeviceHandler(deps)],
    ["logoutAllAccountDevices", logoutAllHandler(deps)]
  ]);
}
