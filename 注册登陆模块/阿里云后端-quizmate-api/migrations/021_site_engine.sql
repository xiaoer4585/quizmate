-- 网申引擎站点级配置与声明式热规则（服务端规则库 + hotfix 推送）
-- 1) resume_site_configs：按 hostname 存放声明式配置（选择器/字段映射/策略）
-- 2) resume_engine_patches：按 hostname（空串=全局）推送声明式 JSON 补丁，不执行远程代码

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

CREATE INDEX IF NOT EXISTS idx_resume_engine_patches_host ON resume_engine_patches (hostname, enabled, id);
