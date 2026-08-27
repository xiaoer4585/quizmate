-- 邀请好友阶梯奖励发放记录。
-- 本文件定义最终表结构；013_referral_tiered_grants.sql 负责兼容曾执行过旧版 012 的环境。

CREATE TABLE IF NOT EXISTS referral_tiered_grants (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  tier_key text NOT NULL,
  invited_recharged_count integer NOT NULL,
  trigger_order_no text NOT NULL,
  credits_granted integer NOT NULL,
  package_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, tier_key)
);

CREATE INDEX IF NOT EXISTS referral_tiered_grants_account_idx
  ON referral_tiered_grants(account_id, created_at DESC);
