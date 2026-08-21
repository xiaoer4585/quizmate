# CHG-20260821-01 验证证据（本地测试包，不发布）

日期：2026-08-21 +08:00　环境：Windows 11 x64、Electron 31.7.7、electron-builder 24.13.3

## 1. 根因与修复

- 根因：`InterviewHelper.enqueueAnswer` 用 Promise 链把所有答案生成串行化（`this.answerQueue.then(...)`），上一题完整生成（约 6~15 秒）后下一题才发起 AI 请求，任务期间显示"等待生成"。
- 修复：串行队列改为并发槽（`MAX_CONCURRENT_ANSWERS = 2`）：新问题到达即调用 AI；仅当已有 2 个在途请求时排队（`answerWaiters` 直接交接槽位）；保留 `answerGeneration` 守卫（入队前 + 取得槽位后双重校验，停止听写后标记失败不发请求）。后端无需改动（每请求独立事务扣积分）。

## 2. 自动化验证

- typecheck:node / typecheck:web：通过（版本 2026.8.22）。
- `npm run package:win`：`PACKAGED_APP_OK version=2026.8.22 asar=46735750`，产物 `release/QuizMate-Windows-2026.8.22.exe`（+blockmap + latest.yml version 2026.8.22）。
- asar 抽查：`MAX_CONCURRENT_ANSWERS`/`acquireAnswerSlot` 在包内 = true；旧 `answerQueue` 已移除 = false。
- 工作区说明：构建时包含并行会话未提交的 2026.8.22 版本号与商店打包准备改动（electron-builder.yml 仅 appx 段加 backgroundColor、gen-icon.cjs 仅 AppX 图标生成、package-lock），经核对不影响 NSIS 安装包运行时。

## 3. 待用户实测（DT-035）

1. 安装 `windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.8.22.exe`（覆盖安装）。
2. 开启面试听写，连续提两个问题（第二个在第一个答案尚未出来时问出）。
3. 预期：两个任务先后进入"正在生成回答"（第二个不再长时间停在"等待生成"），答案先后返回；积分各扣 20。
4. 回归：停止听写时在途任务中止/排队任务标记失败；单题流程与 2026.8.21 无差异；悬浮窗调节快捷键（2026.8.21 功能）不受影响。

测试通过后发布：与并行会话筹备中的跨端 2026.8.22 发布协调（他们已备 deploy-mac-release-20260822.cjs 与官网 Mac 链接），Windows 侧走 deploy-windows-release 脚本上传 OSS 并打 tag。
