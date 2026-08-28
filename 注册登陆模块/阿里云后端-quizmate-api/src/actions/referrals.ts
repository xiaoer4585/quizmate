import crypto from "node:crypto";
import type { PoolClient } from "pg";
import {
  MAX_REFERRAL_COUNT,
  REFERRAL_BONUS_CREDITS,
  REFERRAL_COMMISSION_RATE,
  REFERRAL_TIERED_BONUSES,
  type ReferralTieredBonus
} from "../domain/credits.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

// ============================================================================
// 辅助函数
// ============================================================================

interface AccountRow {
  account_id: string;
  email: string;
  status: string;
  role: string;
  credits: string | number;
  invite_code: string | null;
  referred_by: string | null;
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

async function requireAccount(client: PoolClient, input: ActionInput): Promise<AccountRow> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (!tokenHash) throw new PublicError("请先登录积分账户。", "AUTH_REQUIRED", 401);
  const result = await client.query<AccountRow>(
    `SELECT a.account_id, a.email, a.status, a.role, c.credits, a.invite_code, a.referred_by
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
  await client.query("UPDATE account_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash]);
  return account;
}

// 生成 6 位邀请码（大写字母+数字，排除易混淆字符）
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

// 确保账户有邀请码
async function ensureInviteCode(client: PoolClient, accountId: string): Promise<string> {
  const result = await client.query<{ invite_code: string }>(
    "SELECT invite_code FROM accounts WHERE account_id = $1",
    [accountId]
  );
  const existing = result.rows[0]?.invite_code;
  if (existing) return existing;

  let attempts = 0;
  while (attempts < 10) {
    const code = generateInviteCode();
    try {
      await client.query(
        "UPDATE accounts SET invite_code = $2 WHERE account_id = $1 AND invite_code IS NULL",
        [accountId, code]
      );
      return code;
    } catch {
      attempts++;
    }
  }
  throw new PublicError("邀请码生成失败，请重试。", "INVITE_CODE_GENERATION_FAILED", 500);
}

// 构造阶梯奖励进度：基于当前「已充值」邀请人数，找到已达成的最高档 + 下一档目标
function buildTierProgress(rechargedCount: number): {
  tiers: Array<{
    tierKey: string;
    invitedRechargedCount: number;
    tierCredits: number;
    tierPackageId: string | null;
    badge: string;
    description: string;
    achieved: boolean;
  }>;
  currentTier: ReferralTieredBonus | null;
  nextTier: ReferralTieredBonus | null;
} {
  const sorted = [...REFERRAL_TIERED_BONUSES].sort((a, b) => a.invitedRechargedCount - b.invitedRechargedCount);
  const tiers = sorted.map((tier) => ({
    tierKey: tier.tierKey,
    invitedRechargedCount: tier.invitedRechargedCount,
    tierCredits: tier.tierCredits,
    tierPackageId: tier.tierPackageId,
    badge: tier.badge,
    description: tier.description,
    achieved: rechargedCount >= tier.invitedRechargedCount
  }));
  let currentTier: ReferralTieredBonus | null = null;
  for (const tier of sorted) {
    if (rechargedCount >= tier.invitedRechargedCount) {
      currentTier = tier;
    } else {
      break;
    }
  }
  const nextTier = sorted.find((tier) => rechargedCount < tier.invitedRechargedCount) ?? null;
  return { tiers, currentTier, nextTier };
}

// ============================================================================
// 用户端 Actions
// ============================================================================

// 生成/获取自己的邀请码
function generateInviteCodeHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const account = await requireAccount(client, input);
      const inviteCode = await ensureInviteCode(client, account.account_id);
      const webBaseUrl = "https://www.quizmate.vip";
      return {
        inviteCode,
        inviteLink: `${webBaseUrl}/#credits?ref=${inviteCode}`,
        shareText: `我发现一个好用的答题助手 QuizMate，注册就送 50 积分，用我的邀请码 ${inviteCode} 还能额外得 ${REFERRAL_BONUS_CREDITS} 积分！${webBaseUrl}/#credits?ref=${inviteCode}`
      };
    });
  };
}

// 获取邀请总览
function getReferralOverviewHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      const inviteCode = await ensureInviteCode(client, account.account_id);

      // 统计数据
      const statsResult = await client.query<{
        total_invited: string;
        registered: string;
        activated: string;
        rewarded: string;
        device_blocked: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_invited,
           COUNT(*) FILTER (WHERE status IN ('registered','activated','rewarded'))::text AS registered,
           COUNT(*) FILTER (WHERE status IN ('activated','rewarded'))::text AS activated,
           COUNT(*) FILTER (WHERE status = 'rewarded')::text AS rewarded,
           COUNT(*) FILTER (WHERE status = 'device_blocked')::text AS device_blocked
         FROM referrals WHERE inviter_account_id = $1`,
        [account.account_id]
      );
      const stats = statsResult.rows[0];

      // 提成统计
      const commissionResult = await client.query<{
        total_amount: string;
        pending_amount: string;
        cleared_amount: string;
        pending_count: string;
      }>(
        `SELECT
           COALESCE(SUM(commission_amount), 0)::text AS total_amount,
           COALESCE(SUM(commission_amount) FILTER (WHERE status = 'pending'), 0)::text AS pending_amount,
           COALESCE(SUM(commission_amount) FILTER (WHERE status = 'cleared'), 0)::text AS cleared_amount,
           COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count
         FROM referral_commissions WHERE inviter_account_id = $1`,
        [account.account_id]
      );
      const commission = commissionResult.rows[0];

      // 提现统计
      const withdrawalResult = await client.query<{
        pending_withdrawal: string;
      }>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','approved')), 0)::text AS pending_withdrawal
         FROM withdrawal_requests WHERE account_id = $1`,
        [account.account_id]
      );
      const withdrawal = withdrawalResult.rows[0];

      // 阶梯奖励统计：邀请人已成功「完成首单充值」的 invitee 数（去重 invitee_account_id）
      const rechargedCountResult = await client.query<{ recharged_count: string }>(
        `SELECT COUNT(DISTINCT r.invitee_account_id)::text AS recharged_count
           FROM referrals r
           JOIN orders o ON o.account_id = r.invitee_account_id
          WHERE r.inviter_account_id = $1
            AND r.status IN ('registered','activated','rewarded')
            AND o.status = 'paid'
            AND o.order_type = 'credits'
            AND o.amount > 0`,
        [account.account_id]
      );
      const rechargedCount = Number(rechargedCountResult.rows[0]?.recharged_count ?? 0);

      // 当前账户是否充值过（用于邀请代理菜单可见性）
      const hasRechargedResult = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total
           FROM orders
          WHERE account_id = $1 AND status = 'paid' AND order_type = 'credits' AND amount > 0`,
        [account.account_id]
      );
      const hasRecharged = Number(hasRechargedResult.rows[0]?.total ?? 0) > 0;

      const tierProgress = buildTierProgress(rechargedCount);

      const webBaseUrl = "https://www.quizmate.vip";
      return {
        inviteCode,
        inviteLink: `${webBaseUrl}/#credits?ref=${inviteCode}`,
        shareText: `我发现一个好用的答题助手 QuizMate，注册就送 50 积分，用我的邀请码 ${inviteCode} 还能额外得 ${REFERRAL_BONUS_CREDITS} 积分！${webBaseUrl}/#credits?ref=${inviteCode}`,
        stats: {
          totalInvited: Number(stats?.total_invited ?? 0),
          registered: Number(stats?.registered ?? 0),
          activated: Number(stats?.activated ?? 0),
          rewarded: Number(stats?.rewarded ?? 0),
          deviceBlocked: Number(stats?.device_blocked ?? 0)
        },
        commission: {
          totalAmount: Number(commission?.total_amount ?? 0),
          pendingAmount: Number(commission?.pending_amount ?? 0),
          clearedAmount: Number(commission?.cleared_amount ?? 0),
          pendingCount: Number(commission?.pending_count ?? 0),
          pendingWithdrawal: Number(withdrawal?.pending_withdrawal ?? 0)
        },
        creditBalance: Number(account.credits),
        tieredBonus: {
          rechargedCount,
          currentTier: tierProgress.currentTier,
          nextTier: tierProgress.nextTier,
          tiers: tierProgress.tiers
        },
        hasRecharged,
        config: {
          referralBonusCredits: REFERRAL_BONUS_CREDITS,
          commissionRate: REFERRAL_COMMISSION_RATE,
          maxReferralCount: MAX_REFERRAL_COUNT
        }
      };
    } finally {
      client.release();
    }
  };
}

// 获取邀请明细列表
function getReferralListHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

      const result = await client.query<{
        referral_id: string;
        invitee_email: string;
        status: string;
        device_id: string | null;
        registered_at: Date | string | null;
        activated_at: Date | string | null;
        created_at: Date | string;
        total_recharge: string | null;
        total_commission: string | null;
      }>(
        `SELECT r.referral_id, a.email AS invitee_email, r.status, r.device_id,
                r.registered_at, r.activated_at, r.created_at,
                (SELECT COALESCE(SUM(amount), 0)::text FROM orders o
                  WHERE o.account_id = a.account_id AND o.status = 'paid' AND o.order_type = 'credits') AS total_recharge,
                (SELECT COALESCE(SUM(rc.commission_amount), 0)::text FROM referral_commissions rc
                  WHERE rc.referral_id = r.referral_id) AS total_commission
         FROM referrals r
         JOIN accounts a ON r.invitee_account_id = a.account_id
         WHERE r.inviter_account_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [account.account_id, pageSize, (page - 1) * pageSize]
      );

      const countResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM referrals WHERE inviter_account_id = $1",
        [account.account_id]
      );

      const statusText: Record<string, string> = {
        pending: "等待注册",
        registered: "已注册",
        activated: "已使用",
        rewarded: "已奖励",
        device_blocked: "同设备不计入"
      };

      return {
        list: result.rows.map((row) => ({
          referralId: row.referral_id,
          inviteeEmail: row.invitee_email,
          status: row.status,
          statusText: statusText[row.status] ?? row.status,
          deviceId: row.device_id ?? "",
          registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : "",
          activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : "",
          createdAt: new Date(row.created_at).toISOString(),
          totalRecharge: Number(row.total_recharge ?? 0),
          totalCommission: Number(row.total_commission ?? 0)
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// 获取提成记录列表
function getCommissionRecordsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
      const statusFilter = String(input.status ?? "").trim();

      const whereClause = statusFilter
        ? "AND rc.status = $2"
        : "";
      const params = statusFilter
        ? [account.account_id, statusFilter, pageSize, (page - 1) * pageSize]
        : [account.account_id, pageSize, (page - 1) * pageSize];

      const result = await client.query<{
        commission_id: string;
        invitee_email: string;
        order_no: string;
        recharge_amount: string;
        commission_rate: string;
        commission_amount: string;
        status: string;
        cleared_at: Date | string | null;
        created_at: Date | string;
      }>(
        `SELECT rc.commission_id, a.email AS invitee_email, rc.order_no, rc.recharge_amount,
                rc.commission_rate, rc.commission_amount, rc.status, rc.cleared_at, rc.created_at
         FROM referral_commissions rc
         JOIN accounts a ON rc.invitee_account_id = a.account_id
         WHERE rc.inviter_account_id = $1 ${whereClause}
         ORDER BY rc.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM referral_commissions WHERE inviter_account_id = $1 ${whereClause}`,
        params.slice(0, statusFilter ? 2 : 1)
      );

      return {
        list: result.rows.map((row) => ({
          commissionId: row.commission_id,
          inviteeEmail: row.invitee_email,
          orderNo: row.order_no,
          rechargeAmount: Number(row.recharge_amount),
          commissionRate: Number(row.commission_rate),
          commissionAmount: Number(row.commission_amount),
          status: row.status,
          statusText: row.status === "pending" ? "待结算" : "已结算",
          clearedAt: row.cleared_at ? new Date(row.cleared_at).toISOString() : "",
          createdAt: new Date(row.created_at).toISOString()
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// 提交提现申请
function requestWithdrawalHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const account = await requireAccount(client, input);
      const alipayAccount = String(input.alipayAccount ?? "").trim();
      const alipayName = String(input.alipayName ?? "").trim();
      if (!alipayAccount) throw new PublicError("请输入支付宝账号。", "INVALID_ALIPAY_ACCOUNT");
      if (!alipayName) throw new PublicError("请输入支付宝实名。", "INVALID_ALIPAY_NAME");

      // 获取待结算提成
      const pendingResult = await client.query<{
        commission_id: string;
        commission_amount: string;
      }>(
        `SELECT commission_id, commission_amount FROM referral_commissions
          WHERE inviter_account_id = $1 AND status = 'pending'
          ORDER BY created_at ASC FOR UPDATE`,
        [account.account_id]
      );

      if (!pendingResult.rowCount) throw new PublicError("没有待结算的提成，无法提现。", "NO_PENDING_COMMISSION");

      const totalAmount = pendingResult.rows.reduce(
        (sum, row) => sum + Number(row.commission_amount),
        0
      );

      if (totalAmount < 50) throw new PublicError(`佣金累计满 50 元可提现，当前待结算 ¥${totalAmount.toFixed(2)}。`, "INSUFFICIENT_AMOUNT");

      const commissionIds = pendingResult.rows.map((row) => row.commission_id);
      const withdrawalId = crypto.randomUUID();

      await client.query(
        `INSERT INTO withdrawal_requests(withdrawal_id, account_id, amount, alipay_account, alipay_name, commission_ids)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [withdrawalId, account.account_id, totalAmount.toFixed(2), alipayAccount, alipayName, JSON.stringify(commissionIds)]
      );

      return {
        withdrawalId,
        amount: totalAmount,
        alipayAccount,
        alipayName,
        status: "pending",
        statusText: "待审核",
        message: "提现申请已提交，客服审核后会通过支付宝打款。"
      };
    });
  };
}

// 获取提现记录
function getWithdrawalRecordsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    const client = await deps.db.connect();
    try {
      const account = await requireAccount(client, input);
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

      const result = await client.query<{
        withdrawal_id: string;
        amount: string;
        alipay_account: string;
        alipay_name: string;
        status: string;
        paid_trade_no: string | null;
        paid_at: Date | string | null;
        note: string | null;
        created_at: Date | string;
      }>(
        `SELECT withdrawal_id, amount, alipay_account, alipay_name, status, paid_trade_no, paid_at, note, created_at
         FROM withdrawal_requests WHERE account_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [account.account_id, pageSize, (page - 1) * pageSize]
      );

      const countResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM withdrawal_requests WHERE account_id = $1",
        [account.account_id]
      );

      const statusText: Record<string, string> = {
        pending: "待审核",
        approved: "审核通过",
        paid: "已打款",
        rejected: "已驳回"
      };

      return {
        list: result.rows.map((row) => ({
          withdrawalId: row.withdrawal_id,
          amount: Number(row.amount),
          alipayAccount: row.alipay_account,
          alipayName: row.alipay_name,
          status: row.status,
          statusText: statusText[row.status] ?? row.status,
          paidTradeNo: row.paid_trade_no ?? "",
          paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : "",
          note: row.note ?? "",
          createdAt: new Date(row.created_at).toISOString()
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// ============================================================================
// 管理后台 Actions
// ============================================================================

// 邀请推广数据总览
function adminReferralSummaryHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    await authenticateAdmin(deps, input);
    const client = await deps.db.connect();
    try {
      const totalInviters = await client.query<{ count: string }>(
        "SELECT COUNT(DISTINCT inviter_account_id)::text AS count FROM referrals"
      );
      const totalReferrals = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM referrals"
      );
      const totalCommissions = await client.query<{
        pending: string;
        cleared: string;
        total: string;
      }>(
        `SELECT
           COALESCE(SUM(commission_amount) FILTER (WHERE status = 'pending'), 0)::text AS pending,
           COALESCE(SUM(commission_amount) FILTER (WHERE status = 'cleared'), 0)::text AS cleared,
           COALESCE(SUM(commission_amount), 0)::text AS total
         FROM referral_commissions`
      );
      const pendingWithdrawals = await client.query<{ count: string; amount: string }>(
        `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS amount
         FROM withdrawal_requests WHERE status = 'pending'`
      );
      const riskFlags = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM referral_risk_flags WHERE created_at > now() - interval '7 days'"
      );

      // TOP 邀请人
      const topInviters = await client.query<{
        email: string;
        invited_count: string;
        pending_amount: string;
      }>(
        `SELECT a.email,
           COUNT(r.referral_id)::text AS invited_count,
           COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.status = 'pending'), 0)::text AS pending_amount
         FROM referrals r
         JOIN accounts a ON r.inviter_account_id = a.account_id
         LEFT JOIN referral_commissions rc ON rc.inviter_account_id = r.inviter_account_id
         GROUP BY a.account_id, a.email
         ORDER BY invited_count DESC LIMIT 10`
      );

      return {
        totalInviters: Number(totalInviters.rows[0]?.count ?? 0),
        totalReferrals: Number(totalReferrals.rows[0]?.count ?? 0),
        commissions: {
          pending: Number(totalCommissions.rows[0]?.pending ?? 0),
          cleared: Number(totalCommissions.rows[0]?.cleared ?? 0),
          total: Number(totalCommissions.rows[0]?.total ?? 0)
        },
        pendingWithdrawals: {
          count: Number(pendingWithdrawals.rows[0]?.count ?? 0),
          amount: Number(pendingWithdrawals.rows[0]?.amount ?? 0)
        },
        riskFlagsLast7Days: Number(riskFlags.rows[0]?.count ?? 0),
        topInviters: topInviters.rows.map((row) => ({
          email: row.email,
          invitedCount: Number(row.invited_count),
          pendingAmount: Number(row.pending_amount)
        }))
      };
    } finally {
      client.release();
    }
  };
}

// 管理后台：查看所有邀请关系
function adminListReferralsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    await authenticateAdmin(deps, input);
    const client = await deps.db.connect();
    try {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
      const statusFilter = String(input.status ?? "").trim();
      const emailFilter = String(input.email ?? "").trim();

      let whereClause = "WHERE 1=1";
      const params: unknown[] = [];
      let paramIdx = 1;

      if (statusFilter) {
        whereClause += ` AND r.status = $${paramIdx++}`;
        params.push(statusFilter);
      }
      if (emailFilter) {
        whereClause += ` AND (inviter.email LIKE $${paramIdx} OR invitee.email LIKE $${paramIdx})`;
        params.push(`%${emailFilter}%`);
        paramIdx++;
      }

      const result = await client.query(
        `SELECT r.referral_id, r.invite_code, r.status, r.device_id,
                r.registered_at, r.activated_at, r.created_at,
                inviter.email AS inviter_email, invitee.email AS invitee_email
         FROM referrals r
         JOIN accounts inviter ON r.inviter_account_id = inviter.account_id
         JOIN accounts invitee ON r.invitee_account_id = invitee.account_id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, pageSize, (page - 1) * pageSize]
      );

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM referrals r
         JOIN accounts inviter ON r.inviter_account_id = inviter.account_id
         JOIN accounts invitee ON r.invitee_account_id = invitee.account_id
         ${whereClause}`,
        params
      );

      return {
        list: result.rows,
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// 管理后台：查看所有提成记录
function adminListCommissionsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    await authenticateAdmin(deps, input);
    const client = await deps.db.connect();
    try {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
      const statusFilter = String(input.status ?? "").trim();

      const whereClause = statusFilter ? "WHERE rc.status = $3" : "";
      const params = statusFilter
        ? [pageSize, (page - 1) * pageSize, statusFilter]
        : [pageSize, (page - 1) * pageSize];

      const result = await client.query(
        `SELECT rc.commission_id, rc.order_no, rc.recharge_amount, rc.commission_rate,
                rc.commission_amount, rc.status, rc.cleared_at, rc.cleared_by, rc.cleared_note, rc.created_at,
                inviter.email AS inviter_email, invitee.email AS invitee_email
         FROM referral_commissions rc
         JOIN accounts inviter ON rc.inviter_account_id = inviter.account_id
         JOIN accounts invitee ON rc.invitee_account_id = invitee.account_id
         ${whereClause}
         ORDER BY rc.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM referral_commissions rc ${whereClause}`,
        statusFilter ? [statusFilter] : []
      );

      return {
        list: result.rows.map((row) => ({
          ...row,
          recharge_amount: Number(row.recharge_amount),
          commission_rate: Number(row.commission_rate),
          commission_amount: Number(row.commission_amount)
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// 管理后台：查看提现申请
function adminListWithdrawalsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    await authenticateAdmin(deps, input);
    const client = await deps.db.connect();
    try {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
      const statusFilter = String(input.status ?? "").trim();

      const whereClause = statusFilter ? "WHERE w.status = $3" : "";
      const params = statusFilter
        ? [pageSize, (page - 1) * pageSize, statusFilter]
        : [pageSize, (page - 1) * pageSize];

      const result = await client.query(
        `SELECT w.withdrawal_id, w.amount, w.alipay_account, w.alipay_name, w.status,
                w.paid_trade_no, w.paid_at, w.paid_by, w.note, w.created_at, w.updated_at,
                a.email AS account_email
         FROM withdrawal_requests w
         JOIN accounts a ON w.account_id = a.account_id
         ${whereClause}
         ORDER BY w.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM withdrawal_requests w ${whereClause}`,
        statusFilter ? [statusFilter] : []
      );

      return {
        list: result.rows.map((row) => ({
          ...row,
          amount: Number(row.amount)
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// 管理后台：审核通过提现申请
function adminApproveWithdrawalHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const admin = await authenticateAdmin(deps, input);
      const withdrawalId = String(input.withdrawalId ?? "").trim();
      if (!withdrawalId) throw new PublicError("请选择提现申请。", "MISSING_WITHDRAWAL_ID");

      const result = await client.query(
        `UPDATE withdrawal_requests SET status = 'approved', updated_at = now()
         WHERE withdrawal_id = $1 AND status = 'pending' RETURNING *`,
        [withdrawalId]
      );
      if (!result.rowCount) throw new PublicError("提现申请不存在或已处理。", "WITHDRAWAL_NOT_FOUND");

      // 记录审计日志
      await client.query(
        `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
         VALUES ($1, 'approve_withdrawal', 'withdrawal', $2, $3)`,
        [admin.accountId, withdrawalId, input.note ? String(input.note) : null]
      );

      return { approved: true, withdrawalId };
    });
  };
}

// 管理后台：标记已打款
function adminMarkWithdrawalPaidHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const admin = await authenticateAdmin(deps, input);
      const withdrawalId = String(input.withdrawalId ?? "").trim();
      const paidTradeNo = String(input.paidTradeNo ?? "").trim();
      if (!withdrawalId) throw new PublicError("请选择提现申请。", "MISSING_WITHDRAWAL_ID");
      if (!paidTradeNo) throw new PublicError("请输入支付宝打款订单号。", "MISSING_TRADE_NO");

      const result = await client.query<{ commission_ids: string[]; account_id: string }>(
        `UPDATE withdrawal_requests
           SET status = 'paid', paid_trade_no = $2, paid_at = now(), paid_by = $3, updated_at = now()
         WHERE withdrawal_id = $1 AND status IN ('pending','approved') RETURNING commission_ids, account_id`,
        [withdrawalId, paidTradeNo, admin.accountId]
      );
      if (!result.rowCount) throw new PublicError("提现申请不存在或已处理。", "WITHDRAWAL_NOT_FOUND");

      const row = result.rows[0]!;
      // 清零关联的提成记录
      const commissionIds = Array.isArray(row.commission_ids) ? row.commission_ids : [];
      if (commissionIds.length > 0) {
        const placeholders = commissionIds.map((_, i) => `$${i + 2}`).join(",");
        await client.query(
          `UPDATE referral_commissions
              SET status = 'cleared', cleared_at = now(), cleared_by = $1, cleared_note = $2
            WHERE commission_id IN (${placeholders}) AND status = 'pending'`,
          [admin.accountId, `提现 ${withdrawalId} 已打款 ${paidTradeNo}`, ...commissionIds]
        );
      }

      // 记录审计日志
      await client.query(
        `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
         VALUES ($1, 'mark_withdrawal_paid', 'withdrawal', $2, $3)`,
        [admin.accountId, withdrawalId, `打款订单号: ${paidTradeNo}`]
      );

      return { paid: true, withdrawalId, paidTradeNo };
    });
  };
}

// 管理后台：驳回提现申请
function adminRejectWithdrawalHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const admin = await authenticateAdmin(deps, input);
      const withdrawalId = String(input.withdrawalId ?? "").trim();
      const note = String(input.note ?? "").trim();
      if (!withdrawalId) throw new PublicError("请选择提现申请。", "MISSING_WITHDRAWAL_ID");

      const result = await client.query(
        `UPDATE withdrawal_requests SET status = 'rejected', note = $2, updated_at = now()
         WHERE withdrawal_id = $1 AND status IN ('pending','approved') RETURNING *`,
        [withdrawalId, note]
      );
      if (!result.rowCount) throw new PublicError("提现申请不存在或已处理。", "WITHDRAWAL_NOT_FOUND");

      // 记录审计日志
      await client.query(
        `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
         VALUES ($1, 'reject_withdrawal', 'withdrawal', $2, $3)`,
        [admin.accountId, withdrawalId, note]
      );

      return { rejected: true, withdrawalId };
    });
  };
}

// 管理后台：批量清零提成（标记已返现）
function adminClearCommissionsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    return transaction(deps, async (client) => {
      const admin = await authenticateAdmin(deps, input);
      const commissionIds = Array.isArray(input.commissionIds) ? input.commissionIds : [];
      if (!commissionIds.length) throw new PublicError("请选择要清零的提成记录。", "MISSING_COMMISSION_IDS");

      const placeholders = commissionIds.map((_, i) => `$${i + 2}`).join(",");
      const result = await client.query(
        `UPDATE referral_commissions
            SET status = 'cleared', cleared_at = now(), cleared_by = $1, cleared_note = $2
          WHERE commission_id IN (${placeholders}) AND status = 'pending'`,
        [admin.accountId, input.note ? String(input.note) : "手动清零", ...commissionIds]
      );

      // 记录审计日志
      await client.query(
        `INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason)
         VALUES ($1, 'clear_commissions', 'referral_commissions', $2, $3)`,
        [admin.accountId, commissionIds.join(","), `清零 ${result.rowCount} 条提成记录`]
      );

      return { cleared: result.rowCount, commissionIds };
    });
  };
}

// 管理后台：查看风险标记
function adminListRiskFlagsHandler(deps: ActionDependencies): ActionHandler {
  return async (input) => {
    await authenticateAdmin(deps, input);
    const client = await deps.db.connect();
    try {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

      const result = await client.query(
        `SELECT f.flag_id, f.risk_type, f.detail, f.ip_digest, f.created_at,
                a.email AS account_email
         FROM referral_risk_flags f
         LEFT JOIN accounts a ON f.account_id = a.account_id
         ORDER BY f.created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize]
      );

      const countResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM referral_risk_flags"
      );

      const riskTypeText: Record<string, string> = {
        same_device: "同设备注册",
        same_ip_burst: "同IP短时间大量注册",
        self_referral: "自邀请",
        abnormal_pattern: "异常模式"
      };

      return {
        list: result.rows.map((row) => ({
          ...row,
          risk_type_text: riskTypeText[row.risk_type] ?? row.risk_type
        })),
        total: Number(countResult.rows[0]?.count ?? 0),
        page,
        pageSize
      };
    } finally {
      client.release();
    }
  };
}

// ============================================================================
// 导出
// ============================================================================

export function createReferralActions(deps: ActionDependencies): Map<string, ActionHandler> {
  return new Map<string, ActionHandler>([
    // 用户端
    ["generateInviteCode", generateInviteCodeHandler(deps)],
    ["getReferralOverview", getReferralOverviewHandler(deps)],
    ["getReferralList", getReferralListHandler(deps)],
    ["getCommissionRecords", getCommissionRecordsHandler(deps)],
    ["requestWithdrawal", requestWithdrawalHandler(deps)],
    ["getWithdrawalRecords", getWithdrawalRecordsHandler(deps)],
    // 管理后台
    ["adminReferralSummary", adminReferralSummaryHandler(deps)],
    ["adminListReferrals", adminListReferralsHandler(deps)],
    ["adminListCommissions", adminListCommissionsHandler(deps)],
    ["adminListWithdrawals", adminListWithdrawalsHandler(deps)],
    ["adminApproveWithdrawal", adminApproveWithdrawalHandler(deps)],
    ["adminMarkWithdrawalPaid", adminMarkWithdrawalPaidHandler(deps)],
    ["adminRejectWithdrawal", adminRejectWithdrawalHandler(deps)],
    ["adminClearCommissions", adminClearCommissionsHandler(deps)],
    ["adminListRiskFlags", adminListRiskFlagsHandler(deps)]
  ]);
}

// 暴露内部函数供其他模块调用（注册绑定、首次使用触发、充值提成、阶梯奖励）
export const referralInternals = {
  ensureInviteCode,
  generateInviteCode,
  buildTierProgress
};
