-- AI 失败记录邮箱白名单：用于后台过滤自测账号/内部账号产生的失败记录
CREATE TABLE IF NOT EXISTS model_failure_whitelist (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_failure_whitelist_created_idx
  ON model_failure_whitelist(created_at DESC);
