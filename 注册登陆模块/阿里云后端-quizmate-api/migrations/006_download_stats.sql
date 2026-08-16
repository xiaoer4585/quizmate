-- 下载量按天统计表（覆盖 QuizMate 安卓/Windows/Mac 客户端与磁盘轻扩 Windows 客户端）
-- 与 website_daily_visits 同一模式，按上海时区日期聚合。
-- product 取值：quizmate-android / quizmate-windows / quizmate-mac / diskpilot-windows
CREATE TABLE IF NOT EXISTS download_daily_stats (
  stat_date date NOT NULL,
  product text NOT NULL CHECK (product IN ('quizmate-android', 'quizmate-windows', 'quizmate-mac', 'diskpilot-windows')),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_user_agent text,
  last_downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, product)
);
CREATE INDEX IF NOT EXISTS download_daily_stats_date_idx ON download_daily_stats(stat_date ASC);
