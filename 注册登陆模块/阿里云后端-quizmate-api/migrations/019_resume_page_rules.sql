CREATE TABLE IF NOT EXISTS resume_page_rules (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname text NOT NULL,
  signature text NOT NULL,
  label text NOT NULL DEFAULT '',
  control_type text NOT NULL DEFAULT 'text',
  locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_path text NOT NULL DEFAULT '',
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  option_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostname, signature)
);

CREATE INDEX IF NOT EXISTS resume_page_rules_hostname_idx
  ON resume_page_rules(hostname, updated_at DESC);

CREATE INDEX IF NOT EXISTS resume_page_rules_signature_idx
  ON resume_page_rules(signature);
