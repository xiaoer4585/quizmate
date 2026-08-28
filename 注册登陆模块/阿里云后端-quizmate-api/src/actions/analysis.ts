import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { CREDIT_COST_PER_SUCCESS, CREDIT_PACKAGES, REGISTER_BONUS_CREDITS, REFERRAL_BONUS_CREDITS, MAX_REFERRAL_COUNT } from "../domain/credits.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import type {
  ActionDependencies,
  ActionHandler,
  ActionInput,
  AnalysisModelResult,
  RequestContext
} from "../types.js";
import { normalizeDeviceId, requireActiveLicense, type LegacyLicenseRow } from "./licenses.js";
import { setModelFailureContext } from "../services/model-failure-context.js";

interface AuthAccount {
  account_id: string;
  email: string;
  status: string;
  credits: string | number;
}

interface AuthAccess {
  scopeKey: string;
  account?: AuthAccount;
  license?: LegacyLicenseRow;
  deviceId: string;
}

interface IdempotencyRow {
  status: "processing" | "completed" | "failed";
  request_digest: string;
  response_body: Record<string, unknown> | null;
  locked_until: Date | string | null;
}

function stableDigest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function authenticate(deps: ActionDependencies, input: ActionInput): Promise<AuthAccess> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  const deviceId = normalizeDeviceId(input.deviceId);
  if (!tokenHash) {
    const license = await requireActiveLicense(deps, input);
    return { scopeKey: `license:${license.code}:${deviceId}`, license, deviceId };
  }
  const result = await deps.db.query<AuthAccount>(
    `SELECT a.account_id, a.email, a.status, c.credits
       FROM account_sessions s
       JOIN accounts a USING(account_id)
       JOIN credit_accounts c USING(account_id)
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [tokenHash]
  );
  const account = result.rows[0];
  if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (account.status !== "active") throw new PublicError("该账户当前不可用，请联系管理员。", "ACCOUNT_DISABLED", 403);
  return { scopeKey: `account:${account.account_id}`, account, deviceId };
}

function normalizeRequestId(input: ActionInput): { requestId: string; legacy: boolean } {
  const supplied = String(input.requestId ?? "").trim();
  if (supplied) {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) throw new PublicError("请求编号无效。", "INVALID_REQUEST_ID");
    return { requestId: supplied, legacy: false };
  }
  return { requestId: `legacy_${crypto.randomUUID()}`, legacy: true };
}

async function reserveRequest(
  deps: ActionDependencies,
  scopeKey: string,
  accountId: string | null,
  requestId: string,
  digest: string
): Promise<Record<string, unknown> | null> {
  const scope = `analyze:${scopeKey}`;
  const inserted = await deps.db.query(
    `INSERT INTO idempotency_keys(scope, request_id, account_id, request_digest, status, locked_until, expires_at)
     VALUES ($1, $2, $3, $4, 'processing', now() + interval '2 minutes', now() + interval '24 hours')
     ON CONFLICT DO NOTHING`,
    [scope, requestId, accountId, digest]
  );
  if (inserted.rowCount) return null;

  const existing = await deps.db.query<IdempotencyRow>(
    "SELECT status, request_digest, response_body, locked_until FROM idempotency_keys WHERE scope = $1 AND request_id = $2",
    [scope, requestId]
  );
  const row = existing.rows[0];
  if (!row) throw new PublicError("请求状态异常，请重试。", "IDEMPOTENCY_STATE_ERROR", 409);
  if (row.request_digest !== digest) throw new PublicError("请求编号已用于其他内容。", "IDEMPOTENCY_CONFLICT", 409);
  if (row.status === "completed" && row.response_body) return row.response_body;
  if (row.status === "processing" && row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw new PublicError("相同请求正在处理中，请稍后查询。", "REQUEST_IN_PROGRESS", 409);
  }
  const claimed = await deps.db.query(
    `UPDATE idempotency_keys
        SET status = 'processing', locked_until = now() + interval '2 minutes', response_status = NULL, response_body = NULL
      WHERE scope = $1 AND request_id = $2
        AND (status = 'failed' OR locked_until IS NULL OR locked_until <= now())`,
    [scope, requestId]
  );
  if (!claimed.rowCount) throw new PublicError("相同请求正在处理中，请稍后查询。", "REQUEST_IN_PROGRESS", 409);
  return null;
}

async function markFailed(deps: ActionDependencies, access: AuthAccess, requestId: string, error: unknown): Promise<void> {
  const code = error instanceof PublicError ? error.code : "MODEL_UPSTREAM_ERROR";
  await deps.db.query(
    `UPDATE idempotency_keys SET status = 'failed', locked_until = NULL, response_status = $3,
       response_body = jsonb_build_object('code', $4) WHERE scope = $1 AND request_id = $2 AND status = 'processing'`,
    [`analyze:${access.scopeKey}`, requestId, error instanceof PublicError ? error.statusCode : 500, code]
  ).catch(() => undefined);
  await deps.db.query(
    `INSERT INTO usage_logs(account_id, legacy_license_code, device_id, request_id, status, credit_cost, error_code)
     VALUES ($1, $2, NULLIF($3, ''), $4, 'failed', 0, $5)`,
    [access.account?.account_id ?? null, access.license?.code ?? null, access.deviceId, requestId, code]
  ).catch(() => undefined);
}

async function settleSuccess(
  deps: ActionDependencies,
  account: AuthAccount,
  requestId: string,
  source: string,
  deviceId: string,
  modelResult: AnalysisModelResult,
  androidAnswerFallbackMode: string
): Promise<Record<string, unknown>> {
  const client = await deps.db.connect();
  const scope = `analyze:account:${account.account_id}`;
  try {
    await client.query("BEGIN");
    const key = await client.query<IdempotencyRow>(
      "SELECT status, request_digest, response_body, locked_until FROM idempotency_keys WHERE scope = $1 AND request_id = $2 FOR UPDATE",
      [scope, requestId]
    );
    const idempotency = key.rows[0];
    if (!idempotency) throw new Error("idempotency reservation missing");
    if (idempotency.status === "completed" && idempotency.response_body) {
      await client.query("COMMIT");
      return idempotency.response_body;
    }
    if (idempotency.status !== "processing") throw new PublicError("请求状态已失效，请重试。", "IDEMPOTENCY_STATE_ERROR", 409);

    const balanceResult = await client.query<{ credits: string | number; status: string }>(
      `SELECT c.credits, a.status FROM credit_accounts c JOIN accounts a USING(account_id)
        WHERE c.account_id = $1 FOR UPDATE OF c, a`,
      [account.account_id]
    );
    const balanceRow = balanceResult.rows[0];
    if (!balanceRow || balanceRow.status !== "active") throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
    const current = Number(balanceRow.credits);
    if (current < CREDIT_COST_PER_SUCCESS) {
      throw new PublicError(`积分不足。本次分析需要 ${CREDIT_COST_PER_SUCCESS} 积分，请先充值。`, "INSUFFICIENT_CREDITS", 402);
    }
    const next = current - CREDIT_COST_PER_SUCCESS;
    await client.query(
      `UPDATE credit_accounts SET credits = $2,
         total_consumed_credits = total_consumed_credits + $3, updated_at = now()
       WHERE account_id = $1`,
      [account.account_id, next, CREDIT_COST_PER_SUCCESS]
    );
    // 积分流水不再记录 device_id：积分按账号维度归集，与设备无关
    await client.query(
      `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, request_id)
       VALUES ($1, 'consume', $2, $3, $4, $5)`,
      [account.account_id, -CREDIT_COST_PER_SUCCESS, next, source, requestId]
    );
    const response: Record<string, unknown> = {
      ...modelResult,
      androidAnswerFallbackMode,
      creditCost: CREDIT_COST_PER_SUCCESS,
      creditBalance: next,
      usedKnowledge: false,
      knowledgeHits: []
    };
    await client.query(
      `INSERT INTO usage_logs(account_id, device_id, source, request_id, status, credit_cost, used_knowledge)
       VALUES ($1, NULLIF($2, ''), $3, $4, 'success', $5, $6)`,
      [account.account_id, deviceId, source, requestId, CREDIT_COST_PER_SUCCESS, false]
    );
    // 邀请奖励：首次成功使用后触发，双方各得积分
    const referralCreditBalance = await tryActivateReferral(client, account.account_id);
    if (referralCreditBalance !== null) response.creditBalance = referralCreditBalance;

    await client.query(
      `UPDATE idempotency_keys SET status = 'completed', response_status = 200, response_body = $3,
         completed_at = now(), locked_until = NULL WHERE scope = $1 AND request_id = $2`,
      [scope, requestId, response]
    );

    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function settleLicenseSuccess(
  deps: ActionDependencies,
  access: AuthAccess,
  requestId: string,
  source: string,
  modelResult: AnalysisModelResult,
  androidAnswerFallbackMode: string
): Promise<Record<string, unknown>> {
  const response: Record<string, unknown> = {
    ...modelResult,
    androidAnswerFallbackMode,
    creditCost: 0,
    usedKnowledge: false,
    knowledgeHits: []
  };
  await deps.db.query(
    `INSERT INTO usage_logs(legacy_license_code, device_id, source, request_id, status, credit_cost,
       used_knowledge, knowledge_hit_count) VALUES ($1, NULLIF($2, ''), $3, $4, 'success', 0, $5, $6)`,
    [access.license!.code, access.deviceId, source, requestId, false, 0]
  );
  await deps.db.query(
    `UPDATE idempotency_keys SET status = 'completed', response_status = 200, response_body = $3,
       completed_at = now(), locked_until = NULL WHERE scope = $1 AND request_id = $2`,
    [`analyze:${access.scopeKey}`, requestId, response]
  );
  return response;
}

function analyzeHandler(deps: ActionDependencies): ActionHandler {
  return async (input, context: RequestContext) => {
    const access = await authenticate(deps, input);
    const balance = Number(access.account?.credits ?? 0);
    if (access.account && balance < CREDIT_COST_PER_SUCCESS) {
      throw new PublicError(`积分不足。本次分析需要 ${CREDIT_COST_PER_SUCCESS} 积分，请先充值。`, "INSUFFICIENT_CREDITS", 402);
    }
    const request = normalizeRequestId(input);
    const digest = stableDigest({
      prompt: input.prompt ?? "",
      pageContext: input.pageContext ?? null,
      screenshotDigest: input.screenshot ? stableDigest(input.screenshot) : "",
      source: input.source ?? ""
    });
    const replay = await reserveRequest(deps, access.scopeKey, access.account?.account_id ?? null, request.requestId, digest);
    if (replay) return { ...replay, replayed: true };

    const source = String(input.source ?? (input.screenshot ? "screen" : "page")).trim().slice(0, 50);
    const deviceId = access.deviceId;
    const mode = String(input.mode ?? "");
    const failureCtx: { requestMode: string; requestId: string; clientIp: string; accountId?: string; accountEmail?: string } = {
      requestMode: mode || (input.screenshot ? "overlay" : "universal"),
      requestId: context.requestId,
      clientIp: context.clientIp
    };
    if (access.account?.account_id) failureCtx.accountId = access.account.account_id;
    if (access.account?.email) failureCtx.accountEmail = access.account.email;
    setModelFailureContext(failureCtx);
    try {
      const result = await deps.runAnalysisModel({
        prompt: String(input.prompt ?? "").slice(0, 20_000),
        pageContext: input.pageContext ?? null,
        screenshot: String(input.screenshot ?? ""),
        source,
        mode
      });
      const fallback = deps.settings ? await deps.settings.get("android_answer_fallback_config") : {};
      const androidAnswerFallbackMode = ["silent", "show_answer"].includes(String(fallback.mode ?? "")) ? String(fallback.mode) : "show_answer";
      if (access.account) {
        return await settleSuccess(
          deps,
          access.account,
          request.requestId,
          source,
          deviceId,
          result,
          androidAnswerFallbackMode
        );
      }
      return await settleLicenseSuccess(deps, access, request.requestId, source, result, androidAnswerFallbackMode);
    } catch (error) {
      await markFailed(deps, access, request.requestId, error);
      throw error;
    } finally {
      setModelFailureContext(undefined);
    }
  };
}

// 邀请奖励激活：被邀请人首次成功使用 AI 后，双方各得积分
async function tryActivateReferral(client: PoolClient, inviteeAccountId: string): Promise<number | null> {
  // 查找该用户的邀请关系（status='registered' 才需要激活）
  const referralResult = await client.query<{
    referral_id: string;
    inviter_account_id: string;
    status: string;
  }>(
    `SELECT referral_id, inviter_account_id, status FROM referrals
      WHERE invitee_account_id = $1 AND status = 'registered' FOR UPDATE`,
    [inviteeAccountId]
  );
  const referral = referralResult.rows[0];
  if (!referral) return null;

  // 检查该用户是否已有成功的 usage_logs（确保是首次使用）
  const usageCount = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM usage_logs WHERE account_id = $1 AND status = 'success'",
    [inviteeAccountId]
  );
  // 如果不止当前这一条，说明已经激活过了
  if (Number(usageCount.rows[0]?.count ?? 0) > 1) return null;

  // 检查邀请人是否已达上限
  const countResult = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM referrals WHERE inviter_account_id = $1 AND status = 'rewarded'",
    [referral.inviter_account_id]
  );
  if (Number(countResult.rows[0]?.count ?? 0) >= MAX_REFERRAL_COUNT) return null;

  // 更新邀请关系状态为已激活
  await client.query(
    "UPDATE referrals SET status = 'activated', activated_at = now() WHERE referral_id = $1",
    [referral.referral_id]
  );

  // 给被邀请人加积分
  const inviteeBalance = await client.query<{ credits: string | number }>(
    "UPDATE credit_accounts SET credits = credits + $2, updated_at = now() WHERE account_id = $1 RETURNING credits",
    [inviteeAccountId, REFERRAL_BONUS_CREDITS]
  );
  const inviteeAfter = Number(inviteeBalance.rows[0]?.credits ?? 0);
  await client.query(
    `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, reason)
     VALUES ($1, 'referral_bonus', $2, $3, 'referral_invitee', '被邀请首次使用奖励')`,
    [inviteeAccountId, REFERRAL_BONUS_CREDITS, inviteeAfter]
  );

  // 给邀请人加积分
  const inviterBalance = await client.query<{ credits: string | number }>(
    "UPDATE credit_accounts SET credits = credits + $2, updated_at = now() WHERE account_id = $1 RETURNING credits",
    [referral.inviter_account_id, REFERRAL_BONUS_CREDITS]
  );
  const inviterAfter = Number(inviterBalance.rows[0]?.credits ?? 0);
  await client.query(
    `INSERT INTO credit_ledger(account_id, operation_type, credits, balance_after, source, reason)
     VALUES ($1, 'referral_bonus', $2, $3, 'referral_inviter', '邀请用户首次使用奖励')`,
    [referral.inviter_account_id, REFERRAL_BONUS_CREDITS, inviterAfter]
  );

  // 更新邀请关系状态为已奖励
  await client.query(
    "UPDATE referrals SET status = 'rewarded' WHERE referral_id = $1",
    [referral.referral_id]
  );
  return inviteeAfter;
}

export function createAnalysisActions(deps: ActionDependencies): Map<string, ActionHandler> {
  return new Map([
    ["getCreditConfig", async () => ({
      costPerSuccess: CREDIT_COST_PER_SUCCESS,
      registerBonusCredits: REGISTER_BONUS_CREDITS,
      packages: CREDIT_PACKAGES.map((item) => ({ ...item, totalCredits: item.baseCredits + item.bonusCredits }))
    })],
    ["analyze", analyzeHandler(deps)]
  ]);
}

export const analysisInternals = { normalizeRequestId, stableDigest, tryActivateReferral };
