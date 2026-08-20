# CHG-20260820-06 验证与发布证据

日期：2026-08-20 +08:00　环境：Windows 11 x64、Electron 31.7.7、electron-builder 24.13.3、阿里云 OSS 两桶

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

## 4. 用户实测（DT-034，2026-08-20）

用户安装 `release/QuizMate-Windows-2026.8.21.exe` 实测面试悬浮窗快捷键调节大小成功，确认批准发布（"测试成功了"）。

## 5. 发布上线（2026-08-20 21:30 CST）

- 官网 download.html / index.html / blog/article-exam-skills.html 三处 Windows 下载链接与版本卡片更新至 2026.8.21（保留并行会话的 Mac 2026.8.21 卡片改动）。
- 脚本：`其他/部署工具/deploy-windows-release-20260821.cjs`（backup 已用修复后的 copy(rollback, object) 方向）。
- 上传：suite/latest.yml + QuizMate-Windows-2026.8.21.exe（87,925,187 字节）+ blockmap 至 quizmate-vip；downloads/ 至两桶；三个官网页面至 quizmate-cn。全部 UPLOAD_OK。
- 本次 OSS 备份真实生效：`rollback/CHG-20260820-06/`（latest.yml、download.html、index.html、blog 文章均为 BACKUP_OK；新 exe 为新对象无需备份）。
- 线上验证：`https://www.quizmate.vip/suite/latest.yml` 返回 version 2026.8.21（sha512 VTRGJZkr...，size 87925187）；`https://quizmate.cn/download.html?nocache=...` Windows 卡片 2026.8.21、下载链接指向新 exe；`https://quizmate.cn/index.html?nocache=...` Windows 菜单链接指向新 exe。
- 缓存说明：无参数首次回读 download.html 返回 CDN 旧缓存（含更早的 Mac 2026.8.13 内容），带参数回读源站内容正确；源站对象已是最新，CDN 边缘按 TTL 自然过期。
- 老客户端（2026.8.20 及更早）启动后经 electron-updater 自动收到 2026.8.21 更新。
- 回滚：恢复 `rollback/CHG-20260820-06/suite/latest.yml` 至 quizmate-vip 即回到 2026.8.20 更新通道；2026.8.20 exe 对象未覆盖仍可直发。

## 6. 遗留说明

- index.html 的 Mac 下载链接仍指向 2026.8.12（download.html 已是 2026.8.21），属并行会话 Mac 侧待统一项，本次不动。
