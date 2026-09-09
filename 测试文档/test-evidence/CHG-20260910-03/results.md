# CHG-20260910-03 发布证据

- 发布提交：`b5966f2f797b029ea57534db50f1a714584289da`；GitHub/Gitee `main` 已同步。
- GitHub Actions：常规构建 `34395141795` 通过；正式上传构建 `34395391409` 通过，Windows ia32 架构校验通过。
- 正式产物：`QuizMate-Windows-2026.09.10.exe`，公网已上传到 `quizmate-cn/suite/`，大小 `82,803,688` 字节；CI SHA-256 证据：`a7ecc74b4e8a46d74bec71966e9b273a55de61aa658ccfc827bc78588ef1be2e`。
- blockmap：公网 `quizmate-cn/suite/QuizMate-Windows-2026.09.10.exe.blockmap`，HTTP HEAD 200，大小 `87,600` 字节。
- 独立服务：已部署并通过远端 `node --test *.test.mjs` 14/14；公网健康检查返回 `ok/database=ok`；服务备份与回滚演练完成，备份目录 `/opt/quizmate-companion-test-backup-CHG-20260910-03`，新服务已恢复运行。
- 独立服务远端哈希：`interview-engine.mjs` `a448c6ffc05d5ca2000f3d2f081d0f483b3c81576313412ea1cd045fe690b2ae`；`interview-policy.mjs` `d3ec34d11ef04422fabc0a3d1ffdcbfb35a46fdbe9f0471beeab815827c923b9`；`server.mjs` `14df35f4ac2aae51e80ac647859cfb061a6dc657648bb8582fca487d0fb7ce94`。
- 回滚对象：待官网切换脚本执行后记录 `quizmate-cn/rollback/CHG-20260910-03/`，旧正式 Windows 更新清单、下载页、首页、博客入口、docs.html 和手册均保留。
- 待完成：生产 `suite/latest.yml` / `downloads/latest.yml`、官网 HTML、Windows 手册切换及公网验证；真实 Windows 麦克风、真实账号 AI/积分、升级/卸载仍需用户实机验收。
