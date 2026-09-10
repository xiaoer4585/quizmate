-- Compatibility migration for installations that applied an earlier
-- 021_site_engine.sql containing an executable `code` column.
-- Keep the legacy column inert and ensure the production runtime only reads
-- declarative JSON from `patch`.

CREATE TABLE IF NOT EXISTS resume_site_configs (
  hostname text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS resume_engine_patches (
  id bigserial PRIMARY KEY,
  hostname text NOT NULL DEFAULT '',
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resume_engine_patches ADD COLUMN IF NOT EXISTS patch jsonb;
ALTER TABLE resume_engine_patches ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE resume_engine_patches ADD COLUMN IF NOT EXISTS enabled boolean;
ALTER TABLE resume_engine_patches ADD COLUMN IF NOT EXISTS version bigint;
ALTER TABLE resume_engine_patches ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE resume_engine_patches SET patch = '{}'::jsonb WHERE patch IS NULL;
UPDATE resume_engine_patches SET note = '' WHERE note IS NULL;
UPDATE resume_engine_patches SET enabled = false WHERE enabled IS NULL;
UPDATE resume_engine_patches SET version = 1 WHERE version IS NULL;
UPDATE resume_engine_patches SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE resume_engine_patches ALTER COLUMN patch SET DEFAULT '{}'::jsonb;
ALTER TABLE resume_engine_patches ALTER COLUMN patch SET NOT NULL;
ALTER TABLE resume_engine_patches ALTER COLUMN note SET DEFAULT '';
ALTER TABLE resume_engine_patches ALTER COLUMN note SET NOT NULL;
ALTER TABLE resume_engine_patches ALTER COLUMN enabled SET DEFAULT true;
ALTER TABLE resume_engine_patches ALTER COLUMN enabled SET NOT NULL;
ALTER TABLE resume_engine_patches ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE resume_engine_patches ALTER COLUMN version SET NOT NULL;
ALTER TABLE resume_engine_patches ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE resume_engine_patches ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_resume_engine_patches_host
  ON resume_engine_patches (hostname, enabled, id);
