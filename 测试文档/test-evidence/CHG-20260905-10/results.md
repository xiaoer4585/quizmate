# CHG-20260905-10 发布证据

- 日期：2026-09-05（Asia/Tokyo）
- 范围：后台 AI 失败白名单过滤、当前页全选/多选删除、单条删除；阿里云 API 与迁移。
- 本地：后端 `npm run typecheck` 通过；生产构建通过；专项 3 个测试文件 9/9 通过；后台内联脚本 `node --check` 通过；部署脚本语法通过。
- 全量回归：148/150 通过；2 项既有 `credit-account-platform` SQL 字符串断言失败，属于工作区既有平台归一化改动，与本次变更无关，已保留失败证据。
- 阿里云：ECS `i-2zedgehm045w1gsarawx`，迁移已应用，服务 `active`，health `status=ok,database=ok`；admin action smoke 均为 HTTP 403（已注册、鉴权生效）。
- 阿里云回滚：ECS `/opt/quizmate-api-shadow.rollback-admin-menu-actions-20260905-225539`；OSS `rollback/CHG-20260905-10/admin-web.index.before.html`。
- 后台对象：`admin-web/index.html`，SHA-256 `7e0c9b2c967200d27fc06b0e407c6a66eb067924c931c1094f03b5beffde8030`。
- 手工待验：管理员登录后验证白名单开关、全选/多选、单条删除和批量删除确认流程。
