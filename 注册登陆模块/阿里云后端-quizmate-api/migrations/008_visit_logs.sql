-- 访问日志表（记录每次访问的 IP、路径、时间）
CREATE TABLE IF NOT EXISTS website_visit_logs (
  id BIGSERIAL PRIMARY KEY,
  visit_date date NOT NULL,
  client_ip text NOT NULL,
  page_path text NOT NULL DEFAULT '/',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_visit_logs_date_idx ON website_visit_logs(visit_date DESC);
CREATE INDEX IF NOT EXISTS website_visit_logs_ip_idx ON website_visit_logs(client_ip);

-- 访问白名单表（标注不计入统计的 IP）
CREATE TABLE IF NOT EXISTS visit_whitelist (
  client_ip text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
