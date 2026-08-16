CREATE TABLE IF NOT EXISTS secret_settings (
  setting_key text PRIMARY KEY,
  encrypted_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS legacy_admin_users (
  legacy_id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz
);

ALTER TABLE legacy_licenses ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE legacy_licenses ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE legacy_licenses ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE legacy_licenses ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE legacy_licenses ADD COLUMN IF NOT EXISTS reset_at timestamptz;

ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS knowledge_hit_count integer NOT NULL DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_data_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credited_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_balance_after bigint;

CREATE INDEX IF NOT EXISTS legacy_licenses_status_created_idx
  ON legacy_licenses(status, created_at DESC);
CREATE INDEX IF NOT EXISTS devices_legacy_license_idx
  ON devices(legacy_license_code, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_docs_legacy_owner_idx
  ON knowledge_docs(legacy_license_code, legacy_device_id, created_at DESC);

