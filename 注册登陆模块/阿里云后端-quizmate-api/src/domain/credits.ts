export const CREDIT_COST_PER_SUCCESS = 10;
export const CREDIT_COST_PER_INTERVIEW = 20;
export const REGISTER_BONUS_CREDITS = 50;
export const OLD_USER_RECHARGE_BONUS = 50; // 老用户充值额外赠送积分

// 邀请注册机制常量
export const REFERRAL_BONUS_CREDITS = 20;       // 邀请注册双方各得积分
export const REFERRAL_COMMISSION_RATE = 0.20;   // 充值提成比例 20%
export const MAX_REFERRAL_COUNT = 50;            // 每用户邀请上限
export const REFERRAL_BONUS_CREDITS_VALUE = REFERRAL_BONUS_CREDITS * CREDIT_COST_PER_SUCCESS / 100; // 仅用于参考展示

export const CREDIT_PACKAGES = [
  { id: "trial", name: "笔面试体验包", amount: "19.90", baseCredits: 200, bonusCredits: 10, tag: "限时优惠" },
  { id: "starter", name: "笔面试实战包", amount: "49.90", baseCredits: 500, bonusCredits: 100, tag: "热门推荐" },
  { id: "pro", name: "笔面试上岸包", amount: "149.00", baseCredits: 1500, bonusCredits: 1000, tag: "性价比之选" },
  { id: "unlimited", name: "无忧包", amount: "399.90", baseCredits: 4000, bonusCredits: 4000, tag: "推荐" }
] as const;
