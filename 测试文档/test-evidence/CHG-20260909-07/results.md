# CHG-20260909-07 发布证据

执行日期：2026-09-09（Asia/Shanghai）

## 本地自动化

- API `npm run typecheck`：通过。
- API `npm run build`：通过。
- 网申/个人简历/站点引擎/官网下载配置回归：17/17 通过（最终定向回归 14/14 网申与规则用例在移除未使用 personal action 后通过）。
- 插件 Node 语法检查：`auth.js`、`background.js`、`content.js`、`profile-schema.js`、`resume.js`、`sidepanel.js`、`adapter-registry.js`、`form-adapters.js` 全部通过。
- 插件示例简历测试：通过。
- API 全量回归：153/155 通过；剩余 2 项为既有 `credit-account-platform` 测试对平台筛选 SQL 文本的旧断言，不涉及本次网申、登录、积分或站点引擎代码，未删除或弱化该测试。

## 插件包

- 本地文件：[QuizMate-网申助手-2026.9.9.zip](../../../扩展插件版/QuizMate-网申助手-2026.9.9.zip)
- 大小：2,798,834 bytes
- SHA-256：`67B444933D4DC3AE5B847045BB05E5C355D7169874CE938123F9C4CA84E539F6`
- 包内 manifest 版本：`2026.9.9`。
- 包内不含 `.env`、`direct-ai.js`、测试服务器、第三方 API Key；包含默认虚构测试简历逻辑和统一账号 UI。

## Aliyun 发布

- 公网 OSS `quizmate-cn`：
  - `downloads/QuizMate-网申助手-2026.9.9.zip` HTTP 200，公网下载 SHA-256 与本地一致（`67B444...E539F6`）。
  - `download.html` HTTP 200，上传 SHA-256 `107f7d2a8296f7bc29768b90fbe17e277750c23cb0b1613d58e132f111dea20c`。
  - `index.html` HTTP 200，上传 SHA-256 `1e269efe4ef7aca35769c91ada512feb1beb9e6a29d128e8b7ed41f676acfc9a`。
  - 备份：`rollback/CHG-20260909-07/download.before.html`、`index.before.html`；新插件对象此前不存在，记录为 `BACKUP_NEW_OBJECT`。
- 指定 VIP 管理后台 `quizmate-vip/admin-web/index.html`：HTTP 200，上传 SHA-256 `788ed7122f5544d1c291bfbd592f322e4215f93869235f7f95c83bc5e0c8608a`。
  - 已验证 `维护网申热规则`、`adminUpsertResumeRule`、`adminSetSiteConfig`、`siteEngineConfig` 控件存在。
  - 备份：`rollback/CHG-20260909-07/admin-web.index.before.html`（旧对象 SHA-256 `7e0c9b2c967200d27fc06b0e407c6a66eb067924c931c1094f03b5beffde8030`）。
- API ECS `i-2zedgehm045w1gsarawx` `/opt/quizmate-api-shadow`：服务 active，健康检查 `{"status":"ok","database":"ok"}`。
  - 数据库迁移已应用：`019_resume_page_rules.sql`、`021_site_engine.sql`、`022_site_engine_declarative_compat.sql`。
  - 站点引擎字段确认仅使用 JSONB `patch`（旧 `code` 列不在生产表结果中）。
  - 未授权 `getSiteEngineConfig`：401 `AUTH_REQUIRED`；未授权 `parseAutofillProfile`：401 登录提示。
  - `getInputExtensionDownload` 返回版本 `2026.9.9` 和新 CN 下载地址。
  - 部署包 SHA-256：`bb378a47a3df80c4c69d94a628a12cddfb82e6f3a32aeb60cd7898410d29563d`。
  - 回滚目录：`/opt/quizmate-api-shadow.rollback-CHG-20260909-07-20260909-231013`。

## 浏览器检查

- `https://www.quizmate.cn/download.html`：页面显示版本 `2026.9.9`、永久免费文案，新 ZIP 链接可见且公网可下载；控制台无 error/warning。
- `https://www.quizmate.vip/admin-web/index.html?v=20260909-2303`：网申字段实验室下可见“维护网申热规则”和“站点引擎配置”，相关保存/读取/删除控件存在；控制台无 error/warning。
- 本地插件预览 420×600：默认选中“示例简历（可直接测试）”；两句官网引导 footer 完整落在 600px 首屏内（footer bottom 598.05px）。

## 未完成/需用户实机验收

- 真实新账号注册、邮箱验证码、登录后 AI 简历解析和真实招聘网站填写仍需用户提供可用测试账号并在 Chrome/Edge 实机验收；自动化仅验证了未登录 401、界面与降级路径，未伪造 AI 成功。
- Chrome 扩展运行时规则仍可被浏览器观察；本次将可变站点规则、模型配置和 API Key 移至后端，但不宣称客户端代码绝对不可逆向。
- 未更新 Windows、Mac、Android 安装包、更新清单或其下载链接。

## 2026-09-10 主线同步与下载页纠正

- 网申发布合并提交：`f5bd148d00d9b646307538cd84d402541998fb7d`；与 GitHub 主线同步后的最终 `main` 提交：`12860e6b8d328d3ca6641c6540ee9260337c2281`。
- 两个远程的最终 `main` 均指向 `12860e6b`；发布标签：`v20260910.1`（网申核心提交）与 `v20260910.2`（同步后的最终主线）。
- 发现官网此前被后续静态发布覆盖为旧的 `input-Resume-Autofill-3.1.0.zip`，已仅重发 `quizmate-cn` 的网申公共静态资源：
  - `downloads/QuizMate-网申助手-2026.9.9.zip`：HTTP 200，2,798,834 bytes，SHA-256 `67B444933D4DC3AE5B847045BB05E5C355D7169874CE938123F9C4CA84E539F6`。
  - `download.html`、`index.html`：页面版本显示 `2026.9.9`，新 ZIP 链接存在，旧 `input-Resume-Autofill-3.1.0.zip` 链接不存在。
  - 本次静态重发备份：`rollback/CHG-20260909-07/extension-package.before.zip`、`download.before.html`、`index.before.html`。
- 未改动或发布 Windows、Mac、Android 客户端代码、安装包、更新清单及下载对象。
