-- 账户便签：后台可对积分账户打便签（颜色 + 富文本），用于筛选与分组运营
CREATE TABLE IF NOT EXISTS account_notes (
  note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  -- 便签纯文本预览（用于表格、筛选下拉、邮件预览；最长 200 字）
  note text NOT NULL,
  -- 便签颜色：gray / blue / green / yellow / orange / red / purple
  color text NOT NULL DEFAULT 'gray' CHECK (color IN ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple')),
  -- 便签富文本正文（用于在线 Word 式编辑与邮件正文渲染；不参与筛选）
  content_html text,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 一个账户下便签不重复（按 note 文本去重，便于按便签筛选时稳定匹配）
CREATE UNIQUE INDEX IF NOT EXISTS account_notes_unique
  ON account_notes(account_id, note);
CREATE INDEX IF NOT EXISTS account_notes_account_idx
  ON account_notes(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_notes_note_idx
  ON account_notes(note);
