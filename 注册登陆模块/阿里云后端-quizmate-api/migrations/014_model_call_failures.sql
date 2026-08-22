-- AI 模型调用失败明细表
-- 用于后台 AI 失败排查：记录每一次 AI 上游调用/解析失败的细节
-- 不同于 model_daily_calls（只统计成功调用），这里记录失败原因、错误码、上游模型、调用方账号等
CREATE TABLE IF NOT EXISTS model_call_failures (
  failure_id bigserial PRIMARY KEY,
  model_type text NOT NULL CHECK (model_type IN ('text', 'image')),
  model_name text NOT NULL,
  error_code text NOT NULL,            -- 例如 MODEL_UPSTREAM_ERROR / MODEL_TIMEOUT / INVALID_MODEL_RESULT / MODEL_NOT_CONFIGURED
  error_message text NOT NULL,         -- 截断后的错误描述
  http_status integer,                 -- 上游 HTTP 状态码（若有），可空
  request_mode text,                   -- voice / universal / overlay / interview / cuoti 等
  account_id text,                     -- 触发该次调用的账号，可空（面试/匿名场景）
  account_email text,                  -- 仅记录账号邮箱快照，避免关联账号后变化
  request_id text,                     -- 客户端/后端请求编号，方便关联日志
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_call_failures_created_idx
  ON model_call_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS model_call_failures_model_type_created_idx
  ON model_call_failures(model_type, created_at DESC);
CREATE INDEX IF NOT EXISTS model_call_failures_error_code_created_idx
  ON model_call_failures(error_code, created_at DESC);

COMMENT ON TABLE model_call_failures IS 'AI 模型调用失败明细（后台 / 模型调用失败 页面使用）';
COMMENT ON COLUMN model_call_failures.error_code IS 'PublicError.code，便于按错误类型聚合';
COMMENT ON COLUMN model_call_failures.request_mode IS '触发调用的业务模式，便于区分面试/语音/通用等';
