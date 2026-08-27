# CHG-20260821-02 验证证据（Mac 端同步 Windows 三个改动）

日期：2026-08-21 +08:00　环境：Windows 11 x64、Electron 31.7.7、electron-builder 24.13.3、阿里云 OSS 两桶

## 1. 背景

用户要求把近期 Windows 客户端的三个改动（CHG-20260820-06 面试悬浮窗快捷键调节、CHG-20260820-09 笔试助手截图/搜题鼠标兜底与可点击操作、CHG-20260821-01 面试 AI 并行生成）同步到 Mac 客户端，**保留 Mac 默认快捷键差异化**：

- 截图：Windows `Alt+Q` / Mac `⌘⌥Q`（Command+Option+Q）
- 搜题：Windows `Alt+E` / Mac `⌘⌥E`（Command+Option+E）
- 面试开始：Windows `Alt+Q` / Mac `⌘⇧I`（Command+Shift+I）

差异在 `shared/shortcuts.ts` 已按平台写死，本次未触碰。

## 2. 改动文件

| 文件 | 改动 |
| --- | --- |
| `mac客户端/QuizMate-Mac/electron/ShortcutsHelper.ts` | 新增 `interviewWindowActions` 白名单（move×4、resize×4、opacity×4、zoom×3、reset_position），面试模式注册与 `getActionsForMode` 放行；保留 voiceModeActions 中的 `interview_start`（Mac 专用 ⌘⇧I） |
| `mac客户端/QuizMate-Mac/electron/main.ts` | 修正 `setIgnoreMouseEvents(ignore)` 真正按 boolean 调用（`true` 转发/`false` 不转发）；为 `interviewOverlayWindow` 增 move/resize 事件持久化（与笔试悬浮窗共享配置）；`TrayManager` 初始化注入 `captureScreenshot` / `searchQuestion` 回调 |
| `mac客户端/QuizMate-Mac/electron/TrayManager.ts` | `TrayCallbacks` 新增 `captureScreenshot?` / `searchQuestion?`；菜单加 "全屏截图" "搜题" 两项作为鼠标兜底入口 |
| `mac客户端/QuizMate-Mac/electron/helpers/InterviewHelper.ts` | 删除串行 `answerQueue`，替换为并发槽（`MAX_CONCURRENT_ANSWERS = 2` + `activeAnswerCount` + `answerWaiters`）；保留 `answerGeneration` 守卫（入队前 + 取得槽位后双重校验） |
| `mac客户端/QuizMate-Mac/src/pages/ExamOverlay.tsx` | 顶部操作区由"快捷键提示"改为"截图 / 搜题 / 复制"三个可点击按钮（`OverlayActionButton`，悬停时通过 `electronAPI.window.setIgnoreMouseEvents(false)` 临时接收鼠标事件，离开恢复 `true` 转发） |
| `mac客户端/QuizMate-Mac/package.json` | 版本 2026.8.22 → 2026.8.23 |
| `mac客户端/QuizMate-Mac/resources/config.json` | 版本 2026.8.22 → 2026.8.23 |

## 3. 静态验证

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `git diff --cached --stat`：

```
mac客户端/QuizMate-Mac/electron/ShortcutsHelper.ts   | 26 +++++++-
mac客户端/QuizMate-Mac/electron/TrayManager.ts       | 19 +++++-
mac客户端/QuizMate-Mac/electron/helpers/InterviewHelper.ts | 58 +++++++++++++-----
mac客户端/QuizMate-Mac/electron/main.ts              | 30 +++++++--
mac客户端/QuizMate-Mac/package.json                  |  2 +-
mac客户端/QuizMate-Mac/resources/config.json         |  2 +-
mac客户端/QuizMate-Mac/src/pages/ExamOverlay.tsx     | 71 +++++++++++++++++-----
7 files changed, 167 insertions(+), 41 deletions(-)
```

- 提交：`55fa86d feat(mac): 面试悬浮窗快捷键调节/笔试鼠标兜底/面试AI并行生成`，已推送至 `codex/mac-capture-test-20260820`。
- 共用 IPC 与 preload：未改 `electron/preload.ts`、`electron/ipcHandlers.ts`、`electron/OverlayManager.ts`；`window.setIgnoreMouseEvents`、`api.exam.screenshot`、`api.exam.search` 已存在（Mac 端实现仅做参数修正与调用方接线）。

## 4. Mac 默认快捷键差异化核查

| 动作 | Windows | Mac（保留） |
| --- | --- | --- |
| 截图 | `Alt+Q` | `⌘⌥Q` |
| 搜题 | `Alt+E` | `⌘⌥E` |
| 面试开始 | `Alt+Q` | `⌘⇧I` |
| 退出 | `Ctrl+Shift+Q` | `Command+Shift+Q` |
| 笔试悬浮窗移动 | `Ctrl+方向` | `Command+方向`（改由 OverlayActionButton 鼠标兜底，键盘控制仍可用） |

差异实现：`shared/shortcuts.ts` 通过 `process.platform === 'darwin' ? macKey : winKey` 选择；`ShortcutsHelper.registerGlobalShortcutsForMode` 在不同 mode 下注册的实际 accelerator 由该文件派生。

## 5. GitHub Actions Mac 构建

- 提交 `55fa86d` 推送后触发 `gh workflow run mac-client-build.yml --ref codex/mac-capture-test-20260820`，运行 `32439553749`。
- Annotations：`The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`。
- 状态：macOS Intel 与 Apple-Silicon job 均 `failure`（运行 1-2 秒后被 CI 拒绝），原因：GitHub 账户计费/额度受限，与本次代码无关。
- 后续：待账户计费/额度恢复后重新触发构建（不需再 push，相同 commit 可重跑）；成功后将 DMG/ZIP 上传至 OSS `downloads/` 与 `mac/`，按 `prepare-mac-release-tag-20260823.cjs`（或对应的 tag 脚本）写入 `latest-mac.yml` 与官网 Mac 链接；本次未发布。
- 不影响 Windows 侧：2026.8.21/2026.8.22（CHG-20260820-06/-09/-21-01）已发布并保留在 `suite/latest.yml` 与 `mac/latest-mac.yml` 之上。

## 6. 限制与待办

- 实体 Mac 屏幕录制、系统音频、麦克风权限与真实 ASR 无法由 Windows 或 GitHub runner 代替，鼠标兜底/快捷键调节/并行生成仍待实体 Mac 实测（已纳入既有 DT-009、DT-020、DT-021、DT-034、DT-035 用例集）。
- 计费恢复后重跑构建 → 写 `prepare-mac-release-tag-20260823.cjs` → 部署脚本与官网 Mac 链接更新；本次仅完成代码 + 静态回归，云构建产物待补。
- CHG-20260820-09 在 Mac 端的对应改动本次已覆盖（托盘兜底 + 顶部 OverlayActionButton）；CHG-20260820-06 与 CHG-20260821-01 在 Mac 端的对应改动同样覆盖（interviewWindowActions 白名单 + 并发槽）。三个 Windows 改动在 Mac 端对齐完成。
