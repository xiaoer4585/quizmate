CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts (
  account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  email text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  register_bonus_credits integer NOT NULL DEFAULT 0 CHECK (register_bonus_credits >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  migrated_at timestamptz,
  CONSTRAINT accounts_email_normalized CHECK (email = lower(trim(email)))
);
CREATE UNIQUE INDEX accounts_email_unique ON accounts (lower(email));

CREATE TABLE account_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_id text,
  platform text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  migrated_at timestamptz
);
CREATE INDEX account_sessions_account_active_idx ON account_sessions(account_id, revoked_at, expires_at);

CREATE TABLE email_codes (
  code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'reset_password')),
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'locked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  migrated_at timestamptz
);
CREATE INDEX email_codes_lookup_idx ON email_codes(lower(email), purpose, created_at DESC);

CREATE TABLE credit_accounts (
  account_id uuid PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  credits bigint NOT NULL DEFAULT 0 CHECK (credits >= 0),
  total_charged_credits bigint NOT NULL DEFAULT 0 CHECK (total_charged_credits >= 0),
  total_consumed_credits bigint NOT NULL DEFAULT 0 CHECK (total_consumed_credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_ledger (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  operation_type text NOT NULL,
  credits bigint NOT NULL CHECK (credits <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  source text,
  service_type text NOT NULL DEFAULT 'study_ai',
  request_id text,
  order_no text,
  package_id text,
  device_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);
CREATE INDEX credit_ledger_account_created_idx ON credit_ledger(account_id, created_at DESC);
CREATE UNIQUE INDEX credit_ledger_request_unique ON credit_ledger(account_id, request_id)
  WHERE request_id IS NOT NULL AND request_id <> '';
CREATE UNIQUE INDEX credit_ledger_order_unique ON credit_ledger(account_id, order_no, operation_type)
  WHERE order_no IS NOT NULL AND order_no <> '';

CREATE TABLE orders (
  order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  out_trade_no text NOT NULL UNIQUE,
  provider text NOT NULL,
  order_type text NOT NULL DEFAULT 'license',
  payment_type text,
  account_id uuid REFERENCES accounts(account_id) ON DELETE RESTRICT,
  email text,
  status text NOT NULL DEFAULT 'created',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  subject text,
  package_id text,
  package_name text,
  base_credits bigint,
  bonus_credits bigint,
  total_credits bigint,
  days integer,
  device_id text,
  fulfillment_mode text,
  legacy_license_code text,
  provider_trade_no text,
  provider_status text,
  paid_at timestamptz,
  notify_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);
CREATE INDEX orders_account_created_idx ON orders(account_id, created_at DESC);
CREATE INDEX orders_status_created_idx ON orders(status, created_at DESC);

CREATE TABLE payment_events (
  payment_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  out_trade_no text NOT NULL REFERENCES orders(out_trade_no) ON DELETE RESTRICT,
  signature_valid boolean NOT NULL,
  payload_digest text NOT NULL,
  status text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, event_id)
);

CREATE TABLE devices (
  device_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  account_id uuid REFERENCES accounts(account_id) ON DELETE CASCADE,
  device_id text NOT NULL,
  platform text,
  app_version text,
  legacy_license_code text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  migrated_at timestamptz,
  UNIQUE(account_id, device_id)
);

CREATE TABLE knowledge_docs (
  doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  owner_type text NOT NULL CHECK (owner_type IN ('account', 'legacy_license')),
  account_id uuid REFERENCES accounts(account_id) ON DELETE CASCADE,
  legacy_license_code text,
  legacy_device_id text,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  text_length integer NOT NULL CHECK (text_length >= 0),
  chunk_count integer NOT NULL CHECK (chunk_count >= 0),
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  text_preview text,
  content_digest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz,
  CONSTRAINT knowledge_owner_valid CHECK (
    (owner_type = 'account' AND account_id IS NOT NULL) OR
    (owner_type = 'legacy_license' AND legacy_license_code IS NOT NULL)
  )
);
CREATE INDEX knowledge_docs_account_created_idx ON knowledge_docs(account_id, created_at DESC);

CREATE TABLE knowledge_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  doc_id uuid NOT NULL REFERENCES knowledge_docs(doc_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_digest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz,
  UNIQUE(doc_id, chunk_index)
);

CREATE TABLE settings (
  setting_key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT settings_no_secret_keys CHECK (setting_key !~* '(secret|password|private.?key|api.?key)')
);

CREATE TABLE usage_logs (
  usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  account_id uuid REFERENCES accounts(account_id) ON DELETE SET NULL,
  legacy_license_code text,
  device_id text,
  source text,
  request_id text,
  status text NOT NULL,
  credit_cost integer NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  model_name text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text,
  used_knowledge boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);
CREATE INDEX usage_logs_account_created_idx ON usage_logs(account_id, created_at DESC);

CREATE TABLE website_daily_visits (
  visit_date date PRIMARY KEY,
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_path text,
  last_visited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);

CREATE TABLE legacy_licenses (
  license_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  code text NOT NULL UNIQUE,
  status text NOT NULL,
  days integer,
  device_id text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);

CREATE TABLE migration_map (
  collection_name text NOT NULL,
  legacy_id text NOT NULL,
  target_table text NOT NULL,
  target_id text NOT NULL,
  source_digest text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection_name, legacy_id)
);

CREATE TABLE admin_audit_logs (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  reason text,
  before_digest text,
  after_digest text,
  request_id text,
  ip_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);

CREATE TABLE idempotency_keys (
  scope text NOT NULL,
  request_id text NOT NULL,
  account_id uuid REFERENCES accounts(account_id) ON DELETE CASCADE,
  request_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(scope, request_id)
);
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys(expires_at);
