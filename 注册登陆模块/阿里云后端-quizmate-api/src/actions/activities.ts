import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";
import { authenticateAdmin } from "./admin.js";

async function account(deps: ActionDependencies, input: ActionInput) {
  const token = hashToken(input.accountToken ?? input.token);
  if (!token) throw new PublicError("请先登录后提交活动申请。", "AUTH_REQUIRED", 401);
  const result = await deps.db.query<{ account_id: string; email: string; status: string }>(
    `SELECT a.account_id, a.email, a.status FROM account_sessions s JOIN accounts a USING(account_id)
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())`, [token]
  );
  const row = result.rows[0];
  if (!row) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
  if (row.status !== "active") throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
  return row;
}

function normalizedUrl(value: unknown) {
  const text = String(value ?? "").trim();
  let url: URL;
  try { url = new URL(text); } catch { throw new PublicError("请输入有效的小红书笔记链接。", "INVALID_NOTE_URL"); }
  if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname) && !/(^|\.)xhslink\.com$/i.test(url.hostname)) throw new PublicError("请输入有效的小红书笔记链接。", "INVALID_NOTE_URL");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").slice(0, 1200);
}

function view(row: Record<string, unknown>) {
  return { id: String(row.claim_id ?? ""), accountEmail: String(row.email ?? ""), product: String(row.product ?? ""), noteUrl: String(row.note_url ?? ""), likeCount: Number(row.like_count), favoriteCount: Number(row.favorite_count), tier: Number(row.tier), rewardCredits: Number(row.reward_credits), proofDataUrl: String(row.proof_data_url ?? ""), proofName: String(row.proof_name ?? ""), status: String(row.status ?? "pending"), rejectReason: String(row.reject_reason ?? ""), submittedAt: row.submitted_at, reviewedAt: row.reviewed_at ?? "" };
}

export function createActivityActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const submit: ActionHandler = async (input) => {
    const user = await account(deps, input);
    const product = String(input.product ?? "study_ai") === "resume_autofill" ? "resume_autofill" : "study_ai";
    const noteUrl = normalizedUrl(input.noteUrl);
    const likeCount = Math.max(0, Math.floor(Number(input.likeCount ?? 0)));
    const favoriteCount = Math.max(0, Math.floor(Number(input.favoriteCount ?? 0)));
    const count = Math.max(likeCount, favoriteCount);
    const tier = count >= 70 ? 70 : count >= 20 ? 20 : 0;
    if (!tier) throw new PublicError("点赞数或收藏数任一项满 20 后即可申请。", "REWARD_TIER_NOT_MET");
    const proof = String(input.proofDataUrl ?? "");
    if (!/^data:image\/(?:png|jpeg|webp|avif);base64,/i.test(proof) || proof.length > 2_000_000) throw new PublicError("请上传 1.5MB 以内的有效截图。", "INVALID_PROOF");
    try {
      const inserted = await deps.db.query<Record<string, unknown>>(
        `INSERT INTO xiaohongshu_reward_claims(account_id,product,note_url,normalized_url,like_count,favorite_count,tier,reward_credits,proof_data_url,proof_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [user.account_id, product, String(input.noteUrl).trim(), noteUrl, likeCount, favoriteCount, tier, tier === 70 ? 2500 : 600, proof, String(input.proofName ?? "").slice(0, 300)]
      );
      return view({ ...inserted.rows[0], email: user.email });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "23505") throw new PublicError("该账号或笔记已有待审核/已通过申请。", "REWARD_ALREADY_SUBMITTED", 409);
      throw error;
    }
  };

  const mine: ActionHandler = async (input) => {
    const user = await account(deps, input);
    const rows = await deps.db.query<Record<string, unknown>>("SELECT * FROM xiaohongshu_reward_claims WHERE account_id=$1 ORDER BY submitted_at DESC", [user.account_id]);
    return { items: rows.rows.map((row) => view({ ...row, email: user.email })) };
  };

  const adminList: ActionHandler = async (input) => {
    await authenticateAdmin(deps, input);
    const status = String(input.status ?? "").trim();
    const rows = await deps.db.query<Record<string, unknown>>(
      `SELECT c.*,a.email FROM xiaohongshu_reward_claims c JOIN accounts a USING(account_id)
       WHERE ($1='' OR c.status=$1) ORDER BY c.submitted_at DESC LIMIT 200`, [status]
    );
    return { items: rows.rows.map(view) };
  };

  const review: ActionHandler = async (input) => {
    const admin = await authenticateAdmin(deps, input);
    const claimId = String(input.claimId ?? "").trim();
    const decision = String(input.decision ?? "").trim();
    if (!claimId || !["approved", "rejected"].includes(decision)) throw new PublicError("审核参数无效。", "INVALID_REVIEW");
    const client = await deps.db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<Record<string, unknown>>("SELECT * FROM xiaohongshu_reward_claims WHERE claim_id=$1 FOR UPDATE", [claimId]);
      const claim = found.rows[0];
      if (!claim) throw new PublicError("活动申请不存在。", "CLAIM_NOT_FOUND", 404);
      if (claim.status !== "pending") throw new PublicError("该申请已经审核。", "CLAIM_REVIEWED", 409);
      if (decision === "approved") {
        const balance = await client.query<{ credits: string | number }>("UPDATE credit_accounts SET credits=credits+$2,updated_at=now() WHERE account_id=$1 RETURNING credits", [claim.account_id, claim.reward_credits]);
        if (!balance.rows[0]) throw new PublicError("用户积分账户不存在。", "CREDIT_ACCOUNT_NOT_FOUND", 409);
        await client.query(`INSERT INTO credit_ledger(account_id,operation_type,credits,balance_after,source,service_type,request_id,reason) VALUES($1,'activity_bonus',$2,$3,'xiaohongshu','activity',$4,'小红书活动审核奖励')`, [claim.account_id, claim.reward_credits, balance.rows[0]?.credits, `xhs:${claimId}`]);
      }
      const updated = await client.query<Record<string, unknown>>(`UPDATE xiaohongshu_reward_claims SET status=$2,reject_reason=$3,reviewed_by=$4,reviewed_at=now() WHERE claim_id=$1 RETURNING *`, [claimId, decision, decision === "rejected" ? String(input.reason ?? "").slice(0, 500) : null, admin.email || admin.accountId]);
      await client.query("COMMIT");
      return view(updated.rows[0] || claim);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  };

  return new Map([
    ["submitXiaohongshuReward", submit], ["listMyXiaohongshuRewards", mine],
    ["adminListXiaohongshuRewards", adminList], ["adminReviewXiaohongshuReward", review]
  ]);
}
