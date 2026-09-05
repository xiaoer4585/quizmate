# CHG-20260906-03 验收证据

## 修复内容

- 明显未完结的 ASR 问题片段会短暂聚合，后续片段合并后只创建一个 AI 任务。
- 未完结片段仅使用 2 秒聚合窗口；完整短问题继续立即提交，不增加普通问题的统一等待。
- 完整短问题仍立即提交，不经过长语音等待路径。
- 非问题、语气词和候选人回答不再创建 `skipped` 任务。
- 客户端和面试悬浮窗对历史 `skipped` 任务做显示过滤，避免旧数据继续污染问题流。
- 最近一小时同一账户上下文和账户隔离逻辑保持不变。

## 自动化结果

执行目录：`windows客户端/QuizMate-Windows`

| 命令 | 结果 |
|---|---|
| `npm run test:shared` | 通过，6 个测试文件 / 47 个测试 |
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run package:win` | 通过，ia32 NSIS |
| `node scripts/verify-packaged-app.cjs release/win-ia32-unpacked` | 通过，版本 `2026.9.5001`、架构 `i386` |

新增自动化覆盖：未完结 ASR 片段识别、完整问题快速路径；共享回归继续覆盖快捷键、截图合并、可靠性和悬浮窗状态。

## 测试包

- 文件：`windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.9.5001.exe`
- 大小：`82,866,090` 字节
- SHA-256：`7BB267CC2D3960E66ABF3000A742309B19B19C2D6C9E70C0781986C5B6B0C09A`
- 包内更新地址：`https://quizmate.cn/temp/CHG-20260906-03/suite/`
- 正式更新映射：未修改；未上传、未上线

## 主流程验收

`E2E-MAIN-001` 的 `S14`、`S15` 已增加长语音合并、非问题隐藏和错误收敛的必要路径，并记录为“自动化通过；实机待用户”。仍需在 Windows 实机验证：长语音真实 ASR 分段只显示一个问题卡、普通短问题速度、真实 AI 回答、失败重试和账号上下文隔离。

## 回滚

无数据库或服务端迁移。恢复本次客户端/共享测试改动后重新生成隔离测试包即可；正式 `suite/latest.yml`、`downloads/latest.yml`、官网和线上更新通道未触碰。
