-- 域名询价表（bulidmate.com / bulidbuddy.com 售卖页公开提交）
CREATE TABLE IF NOT EXISTS domain_inquiries (
  id BIGSERIAL PRIMARY KEY,
  domain text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  offer text,
  message text,
  client_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS domain_inquiries_domain_idx ON domain_inquiries(domain);
CREATE INDEX IF NOT EXISTS domain_inquiries_created_at_idx ON domain_inquiries(created_at DESC);
