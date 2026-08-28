# CHG-20260829-01 发布基线

- 变更目标：把用户已验收的 Windows/Mac 客户端统一发布为公开版本 `2026.08.29`，同步 Gitee/GitHub 构建仓库、官网、OSS 正式下载对象和双端自动更新清单。
- 发布分支：`codex/release-20260829`，基线 `f6a7adf`；Mac 验收分支构建提交 `8a05aa1`。
- 内部版本基线：Windows `2026.8.27002`，Mac `2026.8.28006`。
- 公开版本基线：Windows `2026.8.27.2`，Mac `2026.8.28.6`（客户端配置）；官网分别显示 `2026.8.27.2`、`2026.8.28`。
- 目标版本：更新清单内部合法 SemVer `2026.8.29000`；客户端配置、官网显示和公开安装包文件名统一 `2026.08.29`。
- 生产目标边界：只允许 OSS bucket `quizmate-cn` 与 `https://www.quizmate.cn` / `https://quizmate.cn`，不写 `quizmate-vip`。
- 2026-08-29 发布前线上基线：
  - `download.html`：HTTP 200，17107 字节，ETag `3877A2E0E352124BC39B408711CE0021`。
  - `suite/latest.yml` 与 `downloads/latest.yml`：内部版本 `2026.8.27002`，文件 `QuizMate-Windows-2026.8.27.2.exe`，82,820,119 字节。
  - `mac/latest-mac.yml`：仍为 `2026.8.20` 且指向旧 `temp/mac-test-20260822/` DMG；官网展示的两个 `2026.8.28` DMG 正式路径均为 HTTP 404。本次发布必须修复这一断链。
- Mac 签名基线：用户已在 Apple Silicon/macOS 26 验收 ad-hoc 测试包的启动、截图和 AI 改动；仓库没有可用 Developer ID Application 证书，CI 不得把 ad-hoc 描述成 Apple 正式签名/公证。
- 回滚对象：发布前备份 `suite/latest.yml`、`downloads/latest.yml`、`mac/latest-mac.yml`、`download.html`、`index.html`、`blog/article-exam-skills.html` 至 `rollback/CHG-20260829-01/`；旧版本化安装包保留。
- 回滚步骤：从上述前缀恢复清单和页面；不删除新版本化对象；无数据库、后端 schema 或用户数据迁移。

