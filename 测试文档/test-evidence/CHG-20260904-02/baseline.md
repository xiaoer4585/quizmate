# CHG-20260904-02 修改前基线

- 时间：2026-09-04 +08:00
- Git HEAD：`4d34c9e401811f63f869fc8b5056bd49f52b1329`
- 发布边界：仅生成 Windows 隔离测试包；不修改官网、正式安装包对象、`latest.yml` 或用户更新通道；Windows 用户验收前不构建 Mac。
- 工作区：开始时存在大量与本轮无关的官网、网申插件和后端未提交修改。本轮只选择性修改、测试和提交明确列入 CHG-20260904-02 的文件，不回退或覆盖其他修改。

## 关键文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/main.ts` | `0E40859393A94EC55D6F707C49E9056DBC29A8143B62457182618C3C2C330D2C` |
| `desktop-core/src/pages/ExamOverlay.tsx` | `9CCF3105AC2D17981EFF5F38D3464EBF5351D8643D615C746F6F597F1720A8B1` |
| `desktop-core/src/pages/Interview.tsx` | `4ADD56B3CF9B97F659AD3F25EBB07A0E70848088C7847E33FED4756245D00BE7` |
| `desktop-core/src/pages/Dashboard.tsx` | `F4DFA32399EB21E2DE7E8DF46FDC21C4ED28B0A6F9BB34EB2F9C49C4F7AA5E5F` |
| `desktop-core/src/pages/Extension.tsx` | `FBF3A99B94B83CBEA541D958079B425DAEED6C582502D7E8C4094BC83478D2B6` |
| `desktop-core/shared/shortcuts.ts` | `7B16B4C9A30629917074A8A4F6102C898DE64ADBDAAEF2A9C883D2584742050E` |
| `desktop-core/src/components/FeedbackButton.tsx` | `8D272D0575BCF5499D5CCCCF07887EBD09084051FB89ACCCE09C7B8FF7FB14EA` |

## 已知基线缺陷

- 笔试显隐默认键仍是 `Ctrl+B`，与本轮验收要求 `Alt+B` 不符。
- `handleShortcutAction` 以 `interviewOverlayActive` 全局路由，导致 Alt+B、截图和窗口调节动作被面试状态劫持。
- `ExamOverlay` 新截图只在 idle/error 状态切回队列，且未清空上一轮答案；异步旧结果可能覆盖新截图。
- 面试页面仍保留独立“悬浮窗”按钮及下方“开始面试”按钮，没有合并到右上角。
- 笔试页仍有“检测更新”按钮；工作台没有手动检测入口。
- 网申插件页面仍使用编译期固定下载 URL。
- 后端反馈表/action 的生产就绪状态未验证，本轮先做本地契约与明确错误处理，生产写入需遵守发布边界。

## 回滚验证边界

- 客户端回滚到本基线后应能使用既有笔试与面试入口；本轮新增后端公开下载 action 必须保持对旧客户端无副作用。
- 本轮不执行第三方截图、录屏或投屏规避测试；只确认既有保护调用未因窗口状态重构被删除，并验证 QuizMate 自身截图前后窗口恢复与鼠标穿透静态门禁。
