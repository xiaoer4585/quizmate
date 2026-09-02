CREATE TABLE IF NOT EXISTS xiaohongshu_reward_claims (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  product text NOT NULL DEFAULT 'study_ai',
  note_url text NOT NULL,
  normalized_url text NOT NULL,
  like_count integer NOT NULL CHECK (like_count >= 0),
  favorite_count integer NOT NULL CHECK (favorite_count >= 0),
  tier integer NOT NULL CHECK (tier IN (20, 70)),
  reward_credits integer NOT NULL CHECK (reward_credits > 0),
  proof_data_url text NOT NULL,
  proof_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS xhs_claim_account_product_unique ON xiaohongshu_reward_claims(account_id, product) WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX IF NOT EXISTS xhs_claim_url_product_unique ON xiaohongshu_reward_claims(normalized_url, product) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS xhs_claim_status_submitted_idx ON xiaohongshu_reward_claims(status, submitted_at DESC);
