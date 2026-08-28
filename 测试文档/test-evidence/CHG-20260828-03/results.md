# CHG-20260828-03 Windows SemVer 修复正式发布证据

- 范围：将用户已验证通过的 Windows 启动崩溃修复以正式更新包发布；同步 Gitee/GitHub、阿里云 `quizmate-cn`、官网 Windows 下载链接和 `suite/latest.yml` / `downloads/latest.yml`。
- 内部版本：`2026.8.27002`；业务版本与文件名：`2026.8.27.2`。
- 发布边界：只发布 Windows EXE、blockmap、两份 Windows 更新清单及官网 `download.html`、`index.html`、`blog/article-exam-skills.html`；不发布 Mac、Android、后端、管理后台或旧 VIP 域名。
- 风险等级：高。更新 `suite/latest.yml` 会向已安装的 Windows 客户端推送新版本。
- 受影响用例：DT-001、DT-004、DT-018、PK-001、PK-004～PK-006、PK-011、PK-013、PK-021、CP-001、RB-006、RB-008、DL-002、DL-005、DL-008。
- 验收：正式 GitHub Actions ia32 构建、类型检查、PE/ASAR/内部版本、生产 `app-update.yml`、清单哈希和大小、OSS 回读、官网链接、公网 Range GET、旧对象保留与回滚备份均通过后才完成发布。
- 回滚：发布脚本在 `rollback/CHG-20260828-03-WIN/` 备份被替换的更新清单和官网页面；旧版本化安装包不覆盖。恢复备份的 `suite/latest.yml`、`downloads/latest.yml` 和三个 HTML 即可停止推送并恢复旧官网下载入口。
- 前置实机结果：用户已确认隔离测试包 Windows 安装和启动验证通过；SHA-256 `6078ff1c9a6c452344f1f895614fd9d095d9d67ac2692cbbbceda773ce29a5f0`。
- 发布状态：执行中。
