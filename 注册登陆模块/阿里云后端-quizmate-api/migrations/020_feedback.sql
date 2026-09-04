CREATE TABLE IF NOT EXISTS user_feedback (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  email text NOT NULL DEFAULT '',
  description text NOT NULL,
  attachment_name text NOT NULL DEFAULT '',
  attachment_data text NOT NULL DEFAULT '',
  attachment_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_feedback_created_idx ON user_feedback(created_at DESC);
