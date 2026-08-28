-- 积分流水白名单（后台过滤不看这些邮箱的流水，用于忽略管理员自测账号）
CREATE TABLE IF NOT EXISTS credit_log_whitelist (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
