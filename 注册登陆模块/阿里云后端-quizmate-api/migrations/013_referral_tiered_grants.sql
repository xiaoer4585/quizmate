-- 兼容修复：若环境曾执行过旧版 012_referral_tiered_bonus.sql，补齐最终字段。
CREATE TABLE IF NOT EXISTS referral_tiered_grants (
  grant_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  tier_key               TEXT NOT NULL,                       -- 来自 domain/credits.ts 的 REFERRAL_TIERED_BONUSES.tierKey
  invited_recharged_count INTEGER NOT NULL,                    -- 触发该奖励时的累计已充值 invitee 数（快照）
  trigger_order_no       TEXT NOT NULL,                        -- 触发该奖励的订单号（被邀请人充值订单）
  credits_granted        INTEGER NOT NULL,                     -- 实际发放的积分数
  package_id             TEXT,                                 -- 关联积分包 id
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, tier_key)
);

ALTER TABLE referral_tiered_grants
  ALTER COLUMN tier_key TYPE text USING tier_key::text,
  ADD COLUMN IF NOT EXISTS invited_recharged_count integer,
  ADD COLUMN IF NOT EXISTS trigger_order_no text,
  ADD COLUMN IF NOT EXISTS credits_granted integer,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE referral_tiered_grants
SET invited_recharged_count = COALESCE(invited_recharged_count, 0),
    trigger_order_no = COALESCE(trigger_order_no, 'legacy-migration'),
    credits_granted = COALESCE(credits_granted, 0)
WHERE invited_recharged_count IS NULL
   OR trigger_order_no IS NULL
   OR credits_granted IS NULL;

ALTER TABLE referral_tiered_grants
  ALTER COLUMN invited_recharged_count SET NOT NULL,
  ALTER COLUMN trigger_order_no SET NOT NULL,
  ALTER COLUMN credits_granted SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_tiered_grants_account
  ON referral_tiered_grants (account_id);

COMMENT ON TABLE referral_tiered_grants IS '邀请裂变阶梯奖励发放记录：邀请 10 位好友成功充值 -> 笔面试上岸包；邀请 20 位好友成功充值 -> 无忧包；同一用户同一档位幂等';
