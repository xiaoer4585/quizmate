# CHG-20260905-03 发布基线

- 范围：仅发布 Windows 客户端 `2026.09.05.1`（内部版本 `2026.9.5001`），更新官网 Windows 下载映射、Windows 自动更新清单和 Windows 操作手册。
- 用户验收：用户已完成 Windows 测试包验证并明确批准上线。
- 手册变更：新增“面试过程中临时答题或 Coding”场景，明确笔试助手需切换为“悬浮框文字模式”，并说明 `Alt+R`、`Alt+B`、`Alt+Q`、`Alt+E` 的并行使用流程。
- 发布边界：Mac 不构建、不上传、不更新清单、不修改官网 Mac 卡片。
- 构建要求：正式 Windows 安装包必须由 GitHub Actions 的 `windows-publish-*` 标签构建并上传，不复用本地测试安装包。
- 回滚：发布前备份 `suite/latest.yml`、`downloads/latest.yml`、`download.html`、`index.html`、`blog/article-exam-skills.html`、`downloads/QuizMate-Windows-Manual.pdf` 到 `quizmate-cn/rollback/CHG-20260905-03/`；旧版本化安装包继续保留。
- 当前生产基线：Windows 内部版本 `2026.9.5000`、公开版本 `2026.09.05`；Mac 清单仍为 `2026.8.29000`。
