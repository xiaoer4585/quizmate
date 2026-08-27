# CHG-20260822-04 测试证据

## 自动化检查

| 检查 | 命令 | 结果 |
|---|---|---|
| Mac Node 类型检查 | `npm run typecheck:node`（`mac客户端/QuizMate-Mac`） | 通过 |
| Mac Web 类型检查 | `npm run typecheck:web`（`mac客户端/QuizMate-Mac`） | 通过 |
| Mac Electron 生产构建 | `npm run build`（`mac客户端/QuizMate-Mac`） | 通过，生成 `out/main`、`out/preload`、`out/renderer` |
| 空白/冲突检查 | `git diff --check` | 通过 |

## 代码级验收

- 悬浮窗页面已移除截图、搜题、复制实体按钮；主进程和页面继续使用 `setIgnoreMouseEvents(true, { forward: true })`。
- `voice` 快捷键白名单包含 `screenshot`，截图动作不会因笔试语音模式被过滤。
- `interview:toggle` 与 `interview_start` 均调用统一的 `toggleInterviewSession`，开始/结束同步管理听写和面试悬浮窗。
- Mac 邀请代理新增 `getReferralOverview`、已充值门槛和阶梯奖励摘要；积分不足/未充值事件统一打开充值入口。

## 发布结果

- GitHub Actions 运行 `32543836099`：Intel 与 Apple Silicon 均通过类型检查、DMG/ZIP 构建、重签名、`hdiutil verify` 和架构校验。
- 版本 `2026.8.27` 已上传 `quizmate-cn`、`quizmate-vip` 两个 OSS 桶；上传前对象已备份到 `rollback/CHG-20260822-06/`，远端大小/ETag 校验通过。
- `latest-mac.yml`、官网下载页、双架构 DMG/ZIP 公网均 HTTP 200；更新清单版本为 `2026.8.27`。

## 待实机/阻塞

- macOS 实体机的 `⌥Q` 全局注册、屏幕录制权限、真实截图文件生成：阻塞，当前环境为 Windows，不能推断通过。
- macOS 麦克风/系统音频权限、火山实时语音连接、真实 AI 回答：阻塞，需 Apple Silicon 与 Intel 实机安装测试。
- Apple Developer ID 签名/公证：未执行，当前仍为 ad-hoc 签名；首次打开可能需要用户按 macOS 安全设置放行。

## 回滚

无后端、数据库、积分或更新配置迁移。回滚只需恢复本次 Mac 源码和测试文档，删除测试构建产物；不触碰线上对象。
