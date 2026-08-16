-- 添加账户角色字段，支持管理员权限
ALTER TABLE accounts
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- 为管理员角色创建索引
CREATE INDEX accounts_role_idx ON accounts(role);
