# CHG-20260828-08 变更前基线

- 时间：2026-08-28 +08:00
- 工作站：Windows 11 x64；实体 Mac 结果不可由本机推断
- 分支：`codex/mac-capture-interview-20260828`
- Git 基线：`b181a19442e8568005cbfa38c0abc6624bb8651f`
- Mac 内部版本：`2026.8.28005`（业务展示 `2026.8.28.5`）
- 范围：仅客户端 AI 首响应诊断与低风险配合优化；不改后端、不构建安装包、不上传 OSS、不更新官网或自动更新通道

## 关键文件 SHA-256

| SHA-256 | 文件 |
|---|---|
| `890B598A465BBA5947A5628E8A1DA65C66A12EBCB8C28524DCBDAA1D8AD2D1C2` | `desktop-core/electron/main.ts` |
| `F55517B639CADC2B35B00A94F6F4B39AC650A924783EE2C316B36CCFB7A63F1B` | `desktop-core/electron/helpers/ScreenshotHelper.ts` |
| `3B4AD9AF663705A9C86F06A5C926A9B829D2B2E1FD7C627ED64332DE27CF6DC2` | `desktop-core/electron/helpers/InterviewHelper.ts` |
| `9E3527C9A95D10BE4CD41D4AF18770D7B7527D76E75973B2ABFB68C16A5C9348` | `desktop-core/apiClient.ts` |
| `BA7A676A7955E491BBEAFFF646C9734F9D841CAA952463833538E4D9FAE84178` | `desktop-core/interviewTranscript.ts` |
| `3B935E9C4DC798A906D3EE26011C191EA3D99DFD069B39DEA16AF86E0E28FCC4` | `mac客户端/QuizMate-Mac/package.json` |
| `54C8E97E26B023F498672F49E88F71F93A1471F0A6A9C91E5355CA95CEC84510` | `windows客户端/QuizMate-Windows/package.json` |

## 修改前事实

- macOS 26 系统截图附件中悬浮框可见。客户端已有 Electron `setContentProtection(true)` 请求；ScreenCaptureKit 捕获过滤由捕获方控制，公开 API 不保证被捕获应用全局排除自身窗口。
- QuizMate 自有截图会在采集前确定性隐藏笔试和面试悬浮窗，再恢复显示。
- 截图压缩在用户触发“搜题”后才开始；压缩完成后小图直接 base64 发送，避免 OSS 中转。
- 面试每题重复发送 `jobDescription`、`resumeText` 和最近 4,000 字符对话；服务端允许的组合最坏约 32,000 字符。
- API 边缘匿名请求实测 DNS/TCP/TLS/TTFB 总计约 0.15～0.2 秒，无法解释数秒到十几秒的模型等待。

## 回滚与阻塞

- 回滚：恢复上述 Git 基线；本次不产生数据库、持久配置、账号、积分或线上对象迁移。
- 阻塞：实体 Mac 上的系统截图行为、截图后处理 P95、笔试 AI P50/P95 和面试 AI P50/P95 必须在 macOS 26 实机采样。
