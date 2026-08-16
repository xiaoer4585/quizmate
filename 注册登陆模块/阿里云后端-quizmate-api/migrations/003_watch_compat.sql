CREATE TABLE IF NOT EXISTS watch_documents (
  collection_name text NOT NULL,
  document_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz,
  PRIMARY KEY (collection_name, document_id)
);

CREATE INDEX IF NOT EXISTS watch_documents_data_gin_idx
  ON watch_documents USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS watch_documents_account_idx
  ON watch_documents (collection_name, (data ->> 'accountId'));

CREATE INDEX IF NOT EXISTS watch_documents_source_idx
  ON watch_documents (collection_name, (data ->> 'sourceId'));

CREATE INDEX IF NOT EXISTS watch_documents_next_run_idx
  ON watch_documents (collection_name, (data ->> 'nextRunAt'));
