export const CREDIT_COST_PER_SUCCESS = 10;
export const CREDIT_COST_PER_INTERVIEW = 20;
export const REGISTER_BONUS_CREDITS = 50;

// 邀请注册机制常量
export const REFERRAL_BONUS_CREDITS = 20;       // 邀请注册双方各得积分
export const REFERRAL_COMMISSION_RATE = 0.05;   // 充值提成比例 5%（CHG-20260822-05：邀请返现从 20% 调为 5%）
export const MAX_REFERRAL_COUNT = 50;            // 每用户邀请上限
export const REFERRAL_BONUS_CREDITS_VALUE = REFERRAL_BONUS_CREDITS * CREDIT_COST_PER_SUCCESS / 100; // 仅用于参考展示

export const CREDIT_PACKAGES = [
  { id: "trial", name: "网申&笔面试体验包", amount: "19.90", baseCredits: 200, bonusCredits: 10, tag: "限时优惠" },
  { id: "starter", name: "网申&笔面试实战包", amount: "49.90", baseCredits: 500, bonusCredits: 100, tag: "热门推荐" },
  { id: "pro", name: "网申&笔面试上岸包", amount: "149.00", baseCredits: 1500, bonusCredits: 1000, tag: "性价比之选" },
  { id: "unlimited", name: "网申&笔面试无忧包", amount: "399.90", baseCredits: 4000, bonusCredits: 4000, tag: "推荐" }
] as const;

// 网申产品沿用同一账户、余额、支付与订单表，仅用套餐 ID/名称区分订单来源。
export const RESUME_CREDIT_PACKAGES = [
  { id: "resume-trial", name: "网申 Offer 体验包", amount: "19.90", baseCredits: 200, bonusCredits: 10, tag: "9月限时" },
  { id: "resume-starter", name: "网申 Offer 实战包", amount: "49.90", baseCredits: 500, bonusCredits: 100, tag: "热门推荐" },
  { id: "resume-pro", name: "网申 Offer 上岸包", amount: "149.00", baseCredits: 1500, bonusCredits: 1000, tag: "性价比之选" },
  { id: "resume-unlimited", name: "网申 Offer 无忧包", amount: "399.90", baseCredits: 4000, bonusCredits: 4000, tag: "高频投递" }
] as const;

export const ALL_CREDIT_PACKAGES = [...CREDIT_PACKAGES, ...RESUME_CREDIT_PACKAGES] as const;

export function creditPackagesForProduct(product: unknown) {
  return String(product ?? "").trim() === "resume_autofill" ? RESUME_CREDIT_PACKAGES : CREDIT_PACKAGES;
}

// 邀请裂变阶梯奖励（邀请「已充值」用户数达到阈值时一次性发放对应积分包）
//  - 10 位 = 网申&笔面试上岸包 (pro)
//  - 20 位 = 网申&笔面试无忧包 (unlimited)
// 注：发放走 referral_tiered_grants 表，幂等键 (account_id, tier_key)
export const REFERRAL_TIERED_BONUSES = [
  { tierKey: "tier-10-pro",        invitedRechargedCount: 10, tierCredits: 0, tierPackageId: "pro",        badge: "网申&笔面试上岸奖励", description: "10 位好友成功充值，赠 网申&笔面试上岸包" },
  { tierKey: "tier-20-unlimited",  invitedRechargedCount: 20, tierCredits: 0, tierPackageId: "unlimited",  badge: "网申&笔面试无忧奖励", description: "20 位好友成功充值，赠 网申&笔面试无忧包" }
] as const;

export type ReferralTieredBonus = (typeof REFERRAL_TIERED_BONUSES)[number];
