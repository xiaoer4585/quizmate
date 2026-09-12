# CHG-20260910-03 发布证据

- 发布提交：客户端代码 `b5966f2f797b029ea57534db50f1a714584289da`；最终官网/证据提交 Gitee `35ca6aa613d5d17b2b24b1e8ab8c1beaa3b522ba`，GitHub API 等价提交 `a8f79cc1c51444b906ba887da655a462f90c534b`；两端 `main` 树内容一致，`v20260910` 已建立。
- GitHub Actions：常规构建 `34395141795` 通过；正式上传构建 `34395391409` 通过，Windows ia32 架构校验通过。
- 正式产物：`QuizMate-Windows-2026.09.10.exe`，公网已上传到 `quizmate-cn/suite/`，大小 `82,803,688` 字节；CI SHA-256 证据：`a7ecc74b4e8a46d74bec71966e9b273a55de61aa658ccfc827bc78588ef1be2e`。
- blockmap：公网 `quizmate-cn/suite/QuizMate-Windows-2026.09.10.exe.blockmap`，HTTP HEAD 200，大小 `87,600` 字节。
- 独立服务：已部署并通过远端 `node --test *.test.mjs` 14/14；公网健康检查返回 `ok/database=ok`；服务备份与回滚演练完成，备份目录 `/opt/quizmate-companion-test-backup-CHG-20260910-03`，新服务已恢复运行。
- 独立服务远端哈希：`interview-engine.mjs` `a448c6ffc05d5ca2000f3d2f081d0f483b3c81576313412ea1cd045fe690b2ae`；`interview-policy.mjs` `d3ec34d11ef04422fabc0a3d1ffdcbfb35a46fdbe9f0471beeab815827c923b9`；`server.mjs` `14df35f4ac2aae51e80ac647859cfb061a6dc657648bb8582fca487d0fb7ce94`。
- 回滚对象：`quizmate-cn/rollback/CHG-20260910-03/`，已备份旧正式 Windows 更新清单、下载页、首页、博客入口、`docs.html` 和手册。
- 阿里云切换：`PROMOTE_OK bucket=quizmate-cn internal=2026.9.10000 public=2026.09.10`；正式 `suite/latest.yml` 与 `downloads/latest.yml` 均为 `2026.9.10000`，安装包 SHA-256 与 CI/OSS 源一致，Windows 手册 SHA-256 `cda5cc65a6f771df93a5954c410a5b32fd98abc05d5ef74733e405dbc6b690bd`。
- 公网验证：两条安装包入口 HTTP Range 206、总大小 `82,803,688`；下载页、首页（带浏览器 User-Agent）、博客、`docs.html`、PDF 手册 HTTP 200；下载页命中新版本和手册，`docs.html` 命中版本、长语音说明和手册链接。
- 剩余人工项：真实 Windows 麦克风、真实账号 AI/积分、升级/卸载仍需用户实机验收，当前保持“待实机”，不影响自动更新和官网对象已切换的发布结论。
