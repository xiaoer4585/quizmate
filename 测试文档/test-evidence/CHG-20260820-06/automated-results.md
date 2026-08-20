# CHG-20260820-06 自动化验证证据（本地测试包，不发布）

日期：2026-08-20 +08:00　环境：Windows 11 x64、Electron 31.7.7、electron-builder 24.13.3

## 1. 根因

`ShortcutsHelper.registerGlobalShortcutsForMode('interview')` 的白名单只含 interview_start/prev/next 与 quit/reset/toggle_visibility/replay，移动/缩放/透明度/缩放/复位等窗口调节动作从未注册；而 Interview.tsx 挂载即调用 `interview:activateShortcuts` 切到该模式，导致快捷键失效。main.ts 的 interviewActive 路由与 resizeInterviewOverlay 早已存在（Overlay.tsx 注释也宣称支持），仅注册层断链。

## 2. 修复

- ShortcutsHelper：新增 interviewWindowActions 白名单（move×4、resize×4、opacity×4、zoom×3、reset_position），注册与 getActionsForMode 同步放行。
- main.ts：createInterviewOverlayWindow 增加 move/resize 事件持久化（configHelper.setWindowPosition/setWindowSize，与笔试悬浮窗共享配置）。
- 版本号 2026.8.20 -> 2026.8.21（package.json + resources/config.json，仅本地测试包）。

## 3. 验证

- typecheck:node / typecheck:web：通过。
- 生产构建：main 166.68 kB / preload 10.16 kB / renderer 632.04 kB。
- 本地测试包：`npm run package:win` -> `PACKAGED_APP_OK version=2026.8.21 asar=46722133`，产物 `release/QuizMate-Windows-2026.8.21.exe`（+blockmap + latest.yml version 2026.8.21）。
- asar 抽查（ASCII 标记）：`interviewWindowActions` = true（ShortcutsHelper 白名单已编译入包）；`interviewOverlayWindow.getBounds()` = true（main.ts 持久化处理器已编译入包）。
- **未上传 OSS、未更新线上 latest.yml（用户要求先测试）**。

## 4. 待用户实测（DT-034）

1. 安装 `windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.8.21.exe`（覆盖安装即可）。
2. 打开面试助手开始听写（触发 interview 快捷键模式）。
3. 验证 Ctrl+Shift+Up/Down/Left/Right 调节面试悬浮窗高/宽；Ctrl+方向键移动；Ctrl+Shift+R 复位；Ctrl+Shift+1/2 与 Ctrl+[ ] 透明度；Ctrl+-/0/= 缩放。
4. 重启客户端确认尺寸/位置保留（与笔试悬浮窗共享保存值）。
5. 回归：笔试悬浮窗窗口调节、面试听写开始/上一题/下一题（Alt+Q、Alt+Up/Down）不受影响。

测试通过后执行发布：更新官网三处下载链接至 2026.8.21 -> 复用 `deploy-windows-release-20260820.cjs` 模式新建 20260821 脚本上传 OSS -> tag。
