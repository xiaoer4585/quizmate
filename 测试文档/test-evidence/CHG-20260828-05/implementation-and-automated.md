# CHG-20260828-05 实现与自动化证据

## 实现快照

- 分支：`codex/mac-capture-interview-20260828`
- 基线提交：`2418a6ac89039a6a3125d30c5e39395d6a2b36d2`
- 目标 Mac 内部版本：`2026.8.28002`
- 目标业务版本：`2026.8.28.2`
- 未修改：Windows 版本/安装包、官网、正式下载对象、`mac/latest-mac.yml`、后端和数据库。

## 已实现

1. 新权限流程首次从 `/Applications` 启动时，在创建窗口/捕获会话前运行一次 QuizMate 专属 TCC 迁移。
2. 固定命令为 `/usr/bin/tccutil reset All vip.quizmate.mac`，通过 `execFile` 无 shell 执行；不存在无 bundle ID 的全局回退。
3. 成功后清空旧 onboarding 状态并写入全局迁移版本及签名身份；Developer ID 以 Team ID 稳定继承，ad-hoc 以 CDHash 区分，测试签名切换到正式签名时会重新迁移。失败保留可重试状态，普通后续启动幂等跳过。
4. 三个逐项测试按钮改为一个“开始授权”；麦克风、屏幕和系统音频按主进程状态机顺序执行，静音 live 音轨不再判失败。
5. 从 DMG/下载目录直接运行时要求移动至 `/Applications`；屏幕权限改变后支持重启并自动续接。
6. Mac 窗口看门狗持续重设 `focusable=false`、鼠标穿透和 skip taskbar；源码无 `setIgnoreMouseEvents(false)` 路径。
7. QuizMate 自有截图事务同时隐藏笔试和面试悬浮窗，并在 `finally` 恢复各自原可见状态。
8. Hardened Runtime、entitlements、Developer ID/TeamIdentifier 和 notarization hook 已配置；`mac-release-*` 缺任一凭据或使用 ad-hoc 签名时直接失败。

## 自动化结果

执行时间：2026-08-28 +08:00，环境 Windows 11 x64。

### Mac 壳

- `npm run typecheck:node`：通过，0 错误。
- `npm run typecheck:web`：通过，0 错误。
- `npm run test:shared`：通过，2 文件、9 用例。
- `npm run build`：通过；main 30 模块、preload 1 模块、renderer 1723 模块。

### Windows 共享回归

- `npm run typecheck:node`：通过，0 错误。
- `npm run typecheck:web`：通过，0 错误。
- `npm run test:shared`：通过，2 文件、9 用例。
- `npm run build`：通过；main 30 模块、preload 1 模块、renderer 1723 模块。
- 未生成、修改或发布 Windows 安装包。

### 静态、安全与回滚门禁

- `git diff --check`：通过，仅有工作树换行提示，无空白错误。
- GitHub workflow 与 electron-builder YAML：解析通过。
- entitlements plist：XML 解析通过。
- notarize hook 在非 Mac/非正式模式安全跳过：通过。
- TCC 调用固定为 QuizMate bundle ID 且使用无 shell `execFile`：通过。
- 源码扫描无 `setIgnoreMouseEvents(false)`、私有 CGS capture tag、DYLD 注入或进程注入路径：通过。
- 新增差异凭据模式扫描：无 AWS/阿里云/OpenAI key 或私钥正文。
- `git diff | git apply --reverse --check`：通过，代码回滚补丁可反向应用。
- 作用域检查：无官网、后端、生产清单或 Windows tracked file 变化。

## 阻塞项

当前 Windows 主机不能证明 macOS TCC、`tccutil` 实际退出状态、Apple `moveToApplicationsFolder()`、真实鼠标点击穿透、系统音频、Developer ID 签名、notarization/staple 或 Intel/Apple Silicon DMG。DT-052～DT-055、PK-008～PK-010 和 RB-007 的实体 Mac 部分均保持阻塞；在这些 P0/P1 通过前不可正式发布。

## 合规边界

本次保留 Apple/Electron 公开内容保护请求并准确记录可读回状态，但没有加入私有 API、Hook、注入、反监考或第三方捕获规避。QuizMate 自身截图排除悬浮窗已实现；macOS 15+ 任意第三方 ScreenCaptureKit、硬件录制和投屏不宣称全局不可见。
