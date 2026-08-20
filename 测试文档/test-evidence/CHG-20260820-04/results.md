# CHG-20260820-04 测试证据

## 变更前根因

- Mac 截图主要依赖 `screenshot-desktop`/`screencapture`，权限未决定时没有 Electron 原生权限触发路径；区域截图失败后再次进入全屏截图节流，必然返回“截图过于频繁”。
- Mac 默认截图/搜题仍为 `Alt+Q/E`，主页面和笔试悬浮框没有统一订阅 `shortcuts:updated`。
- 实时听写给 Mac 传入 Electron 文档标明仅支持 Windows 的 `audio: loopback`；隐藏页采集失败后主进程只轮询 WebSocket 状态，把真实采集错误覆盖成火山连接超时。
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
| Mac 源码移除 Windows-only loopback、启用原生 picker | 2/2 通过 |
| 听写异步启动与三阶段错误状态 | 2/2 通过 |
| 系统音频 Info.plist 声明、区域截图回退 | 2/2 通过 |

首轮静态断言因 PowerShell 向 `node -e` 传递引号时解析失败；改用 PowerShell 原生断言后 10/10 通过，产品构建本身未失败。

GitHub macOS Intel/Apple Silicon 构建：通过，运行 `32346598933`。两架构均通过类型检查、构建、ad-hoc 重签名、`hdiutil verify` 和可执行文件架构检查；Intel 为纯 `x86_64`，Apple Silicon 为纯 `arm64`。GitHub artifact 因账号存储配额无法保存，使用带时效签名的隔离 OSS 上传通道交付，临时标签已删除。

| 测试包 | 字节 | Runner DMG SHA-256 |
|---|---:|---|
| Apple Silicon DMG | 126893646 | `60ffb6de1aef31fdb815e4d648a4b1832252be107b53d140091c466cab9ec5fe` |
| Intel DMG | 130585931 | `015582da174f6b1f6a908f3277d099e3ab7864b4090e8b6dce249dc676f1a38f` |
| Apple Silicon ZIP | 126877055 | 见隔离构建日志 |
| Intel ZIP | 128983166 | 见隔离构建日志 |

四个测试对象的公网 HEAD 均返回 200，Content-Length 与云构建产物一致。正式 `https://quizmate.cn/mac/latest-mac.yml` 仍为 `2026.8.20`，本轮没有让线上客户端发现或自动安装测试版。

## 实体 Mac 验收

- 屏幕录制权限首次授权、拒绝后恢复、全屏/多屏截图：待用户测试。
- Intel/Apple Silicon 的 `Command+Option+Q/E` 与自定义后即时刷新：待用户测试。
- macOS 15+ 正式模式系统音频、演示模式系统音频+麦克风、真实火山 ASR：待用户测试。
- macOS 14 及以下正式模式：Electron 当前系统音频采集能力不支持，客户端应给出明确版本/音频提示而不是火山连接超时。

## 发布边界

- 本轮未上传官网、OSS 或更新清单；实体 Mac P0 验收前不覆盖线上安装包。
