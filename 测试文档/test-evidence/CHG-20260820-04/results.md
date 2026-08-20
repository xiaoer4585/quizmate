# CHG-20260820-04 测试证据

## 变更前根因

- Mac 截图主要依赖 `screenshot-desktop`/`screencapture`，权限未决定时没有 Electron 原生权限触发路径；区域截图失败后再次进入全屏截图节流，必然返回“截图过于频繁”。
- Mac 默认截图/搜题仍为 `Alt+Q/E`，主页面和笔试悬浮框没有统一订阅 `shortcuts:updated`。
- 实时听写缺少 macOS 14.2+ CoreAudio Tap 必需的用途声明；Electron 官方说明此时会产生无明显异常的死音轨。隐藏页采集失败后主进程又只轮询 WebSocket 状态，把真实采集错误覆盖成火山连接超时。
- macOS 14.2+ 的系统音频采集需要 `NSAudioCaptureUsageDescription`，原包缺少该声明。

## 自动化结果

执行环境：Windows 11 x64，目标版本 `2026.8.21`。

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run build` | 通过；main/preload/renderer 均生成 |
| `git diff --check` | 通过；仅工作区 CRLF 提示 |
| 快捷键默认值、旧值迁移和跨窗口广播 | 4/4 通过 |
| Mac 保留 CoreAudio loopback 请求、启用 macOS 15+ 原生 picker | 2/2 通过 |
| 听写异步启动与三阶段错误状态 | 2/2 通过 |
| 系统音频 Info.plist 声明、区域截图回退 | 2/2 通过 |

首轮静态断言因 PowerShell 向 `node -e` 传递引号时解析失败；改用 PowerShell 原生断言后 10/10 通过，产品构建本身未失败。

GitHub macOS Intel/Apple Silicon 最终构建：通过，运行 `32347275779`。两架构均通过类型检查、构建、ad-hoc 重签名、`hdiutil verify` 和可执行文件架构检查；Intel 为纯 `x86_64`，Apple Silicon 为纯 `arm64`。GitHub artifact 因账号存储配额无法保存，使用带时效签名的隔离 OSS test2 上传通道交付，临时标签已删除。

| 测试包 | 字节 | Runner DMG SHA-256 |
|---|---:|---|
| Apple Silicon DMG | 126893824 | `d740ffd3b9de9d0f8c5cfb71f35bbc7bdeb5ca83def99bfcdbf7811f45d1d6d2` |
| Intel DMG | 130586026 | `e14cff3cea6e4979595da3afce4c681856d84a4257e64a9c9bda16350b0dd5e6` |
| Apple Silicon ZIP | 126877056 | 见隔离构建日志 |
| Intel ZIP | 128983164 | 见隔离构建日志 |

四个测试对象的公网 HEAD 均返回 200，Content-Length 与云构建产物一致。正式 `https://quizmate.cn/mac/latest-mac.yml` 仍为 `2026.8.20`，本轮没有让线上客户端发现或自动安装测试版。

## 实体 Mac 验收

- 屏幕录制权限首次授权、拒绝后恢复、全屏/多屏截图：待用户测试。
- Intel/Apple Silicon 的 `Command+Option+Q/E` 与自定义后即时刷新：待用户测试。
- macOS 15+ 正式模式系统音频、演示模式系统音频+麦克风、真实火山 ASR：待用户测试。
- macOS 14.2+ 正式模式 CoreAudio Tap、macOS 15+ 原生共享选择器：待用户测试；macOS 12.7.6 及以下受系统 API 限制，不支持无虚拟声卡的系统音频采集。

## 发布边界

- 用户随后明确要求更新官网并完成推送。生产发布脚本 `其他/部署工具/deploy-mac-release-20260821.cjs` 已执行成功，将 `2026.8.21` 双架构 DMG/ZIP、下载页和更新清单部署至 `quizmate-cn` 与 `quizmate-vip`。
- 上传前已将两桶原 `latest-mac.yml` 与 `download.html` 备份到 `rollback/CHG-20260820-04/`，四个回滚对象 HEAD 均返回 200。
- `quizmate.cn`、`www.quizmate.vip` 的下载页与 `latest-mac.yml` 均公网返回 200 且包含 `2026.8.21`；两个域名下四个正式大文件共八个 URL 均返回 200，Content-Length 与最终云构建一致。
- 正式更新清单已从 `2026.8.20` 提升至 `2026.8.21`。使用 `https://quizmate.cn/mac/` 当前更新通道且本地版本低于 `2026.8.21` 的历史客户端会发现更新；本地已是 `2026.8.21` 时不会重复提示。
- 当前包仍为 ad-hoc 签名，无 Developer ID、公证和 stapling；更新入口按既定策略打开对应芯片 DMG，不执行未签名 ZIP 的静默替换。
