-- 邀请注册机制：邀请关系、充值提成、提现申请、风险标记
-- 关联 design.md 中的设计方案

-- accounts 表扩展：邀请码 + 被邀请人引用
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES accounts(account_id);

CREATE INDEX IF NOT EXISTS accounts_referred_by_idx ON accounts(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_invite_code_idx ON accounts(invite_code) WHERE invite_code IS NOT NULL;

-- 邀请关系表
CREATE TABLE IF NOT EXISTS referrals (
  referral_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  invitee_account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  invite_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','registered','activated','rewarded','device_blocked')),
  device_id text,
  registered_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_inviter_idx ON referrals(inviter_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_invitee_idx ON referrals(invitee_account_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals(status);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_invitee_unique ON referrals(invitee_account_id);

-- 充值提成记录表
CREATE TABLE IF NOT EXISTS referral_commissions (
  commission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES referrals(referral_id) ON DELETE SET NULL,
  inviter_account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  invitee_account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  order_no text NOT NULL REFERENCES orders(out_trade_no) ON DELETE RESTRICT,
  recharge_amount numeric(12,2) NOT NULL CHECK (recharge_amount >= 0),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.20 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  commission_amount numeric(12,2) NOT NULL CHECK (commission_amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cleared')),
  cleared_at timestamptz,
  cleared_by text,
  cleared_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commissions_inviter_idx ON referral_commissions(inviter_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commissions_status_idx ON referral_commissions(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS commissions_order_unique ON referral_commissions(order_no);

-- 提现申请表
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  withdrawal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  alipay_account text NOT NULL,
  alipay_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','rejected')),
  commission_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_trade_no text,
  paid_at timestamptz,
  paid_by text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawals_account_idx ON withdrawal_requests(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawal_requests(status, created_at DESC);

-- 风险标记表
CREATE TABLE IF NOT EXISTS referral_risk_flags (
  flag_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(account_id) ON DELETE SET NULL,
  referral_id uuid REFERENCES referrals(referral_id) ON DELETE CASCADE,
  risk_type text NOT NULL CHECK (risk_type IN ('same_device','same_ip_burst','self_referral','abnormal_pattern')),
  detail text,
  ip_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_flags_account_idx ON referral_risk_flags(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_flags_type_idx ON referral_risk_flags(risk_type, created_at DESC);
