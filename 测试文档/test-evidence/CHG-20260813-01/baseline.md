# CHG-20260813-01 发布前基线

- 日期：2026-08-13 +08:00
- Git 分支：`feature/mac-client`
- Git 远端：`origin` 指向 `wangxiaoer4585/quizmate`
- Windows package 版本：`2026.8.10`（工作区已有未提交 Microsoft Store 配置，必须保留）
- macOS package 版本：`2026.8.12`。
- 已有未提交内容：Windows Store 打包配置、官网充值页、面试提示词及测试、macOS 发布包等；本次不得回退或覆盖。
- 数据边界：无数据库 schema 或数据迁移；运行时 AI 密钥和支付配置不写入证据。
- 快捷键基线：Windows 截图/搜题为 `Ctrl+W`/`Ctrl+E`；macOS 为 `Command+W`/`Command+E`。
- AI 路由基线：小图 Base64 直传；OSS 图传签名 URL 给上游视觉模型；模型统一 45 秒超时、最大输出 2048 tokens。
