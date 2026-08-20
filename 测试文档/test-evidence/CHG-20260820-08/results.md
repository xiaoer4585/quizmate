# CHG-20260820-08 测试证据

## 发布边界

- 仅修复和构建 Mac 测试包。
- 未修改后端模型、提示词、积分、官网或正式更新清单。
- GitHub Actions 使用手动工作流和测试分支，不创建正式发布标签，因此不会覆盖 OSS 正式对象。

## 变更前问题

- 截图失败事件只发送给笔试悬浮框，悬浮框未创建时用户看到“没有反应”。
- 截图分析在接口完成前清空队列，失败后无法直接重试。
- `getDisplayMedia` 配合 macOS `useSystemPicker` 从隐藏窗口启动，触发共享屏幕选择和 `Timeout starting video source`。
- 面试非 `ApiError` 异常统一显示“答案生成失败”，掩盖真实采集或网络错误。

## 自动化结果

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `npm run build`：通过；首次 renderer 构建在 Windows 无错误输出但进程挂起，保留为失败，结束该构建进程后重跑通过（1699 modules）。
- `git diff --check`：通过。
- ASR 内嵌脚本 `vm.Script` 语法检查：通过。
- 音轨静态检查：通过；无 `useSystemPicker`，主进程提供 loopback，采集后立即停止视频轨，演示/正式模式分支保留。
- 截图编排静态检查：通过；截图失败终止一体化搜题，失败广播到所有窗口，分析仅成功后清空截图。
- 构建产物断言：通过；修复标识已进入 `out/main/index.js`。
- 线上 API 只读连通探测：`analyze` 使用无效测试令牌返回 HTTP 401 / `SESSION_EXPIRED`，证明 endpoint/action 可达且鉴权正常；未调用模型、未扣积分。

## macOS 云构建和测试包

- 手动验证运行 `32374654942`：Intel、Apple Silicon 两个 job 均成功；依赖安装、Node/Web 类型检查、Electron 构建、ad-hoc 重签名、`hdiutil verify`、签名检查和可执行文件架构检查全部通过。
- GitHub artifact 因仓库配额满无法保存附件，但不影响上述构建门结论。
- 使用一次性签名 URL 将相同提交 `8b4aa82` 的测试 DMG 写入隔离测试路径，未写入官网 `downloads/`、更新通道 `mac/` 或 `latest-mac.yml`。
- 第二次运行 `32375036417`：Intel 全部成功；Apple Silicon 在构建、签名、DMG/架构校验和 DMG 上传均成功后，附加 ZIP 上传长期无进展，因本次不发布更新而人工取消。两个安装用 DMG 均已完整回下载。

| 测试包 | 字节 | SHA-256 |
|---|---:|---|
| `QuizMate-Mac-Apple-Silicon-2026.8.21-test.dmg` | 126894136 | `CFBC8D5AA43CDE111D8214F82CE07CAC4366455D907BB194DF0544D07DCC7222` |
| `QuizMate-Mac-Intel-2026.8.21-test.dmg` | 130586330 | `4FEA88FEEC65CE0DC0695C281BB95D44F3B2B3441F4A0F3D442791E3C5C90F6A` |

- 本地目录：`mac客户端/发布包/CHG-20260820-08-test/`。
- 线上只读复核：`https://quizmate.cn/mac/latest-mac.yml` 仍为 `2026.8.21`，官网 `download.html` HTTP 200 且未改动。本次没有更新推送和正式发布。

## 待执行

- 实体 Mac：首次屏幕录制/系统音频/麦克风权限；笔试截图和真实 AI 分析；演示模式双音轨；正式模式仅系统音频；不弹共享屏幕选择器。
- Apple Developer ID 正式签名与公证不属于本次测试包范围。

## 回滚

- 代码回滚点：`2107c95` / 线上客户端 `2026.8.21`。
- 无数据或后端状态迁移；删除测试分支/测试产物并恢复本次六个 Mac 源码文件即可。
