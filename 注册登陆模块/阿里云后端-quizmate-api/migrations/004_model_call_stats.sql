-- 模型调用按天统计表（用于后台曲线图：文本模型 / 图片模型 两条曲线）
-- 与 website_daily_visits 同一模式，按上海时区日期聚合。
CREATE TABLE IF NOT EXISTS model_daily_calls (
  call_date date NOT NULL,
  model_type text NOT NULL CHECK (model_type IN ('text', 'image')),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_model_name text,
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_date, model_type)
);
CREATE INDEX IF NOT EXISTS model_daily_calls_date_idx ON model_daily_calls(call_date ASC);
