# CHG-20260815-03 发布前基线

- 时间：2026-08-15 +08:00
- 发布代码基线：`d19b343`（`feature/mac-client`），Mac `package.json` 版本 `2026.8.13`。
- 发布范围：Apple Silicon 与 Intel DMG；不包含工作区未提交改动。
- 当前线上文件：
  - Apple Silicon：`QuizMate-Mac-Apple-Silicon-2026.8.12.dmg`，126,920,461 bytes，SHA-256 `2A8896A11294875636CA3EFB1CD5E82C86A19BF4F403260C4CB3C0E31A44CDCE`。
  - Intel：`QuizMate-Mac-Intel-2026.8.12.dmg`，130,566,589 bytes，SHA-256 `4BB315D62FD28F54D8BF7997C056E24C15572E93B5662CA01AC51DCB3DCE3D2C`。
- 目标线上路径：`https://quizmate.cn/downloads/QuizMate-Mac-Apple-Silicon-2026.8.13.dmg`、`https://quizmate.cn/downloads/QuizMate-Mac-Intel-2026.8.13.dmg`；更新清单：`https://quizmate.cn/mac/latest-mac.yml`。
- 快捷键基线：源码默认截图/搜题为 `Alt+Q` / `Alt+E`，退出为 `Command+Shift+Q`；旧保存的 `Command+W` / `Command+E` 会迁移到新默认值。
- 回滚：保留现有 `2026.8.12` 对象与清单；若新包验证失败，恢复旧清单并删除新对象，不修改客户端源码或后端状态。
- 平台限制：当前 Windows 无法执行 macOS 实机安装、签名、公证和真机快捷键验证；这些用例必须在 GitHub macOS 构建结果和真实 Mac 上分别记录。
