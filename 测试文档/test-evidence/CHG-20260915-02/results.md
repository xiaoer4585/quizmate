# CHG-20260915-02 验证结果

- 分支：`codex/windows-signing-capture-hide-20260913`，基于提交 `bdd0649`。
- 发布边界：仅本地 Windows 测试构建；未部署后端、未上传、未上线；Mac 未构建。

## 已执行检查

| 检查 | 状态 |
|---|---|
| Windows Node 类型检查 | 通过 |
| Windows Web 类型检查 | 通过 |
| Windows 共享测试 | 通过，10 个文件 / 74 项 |
| Windows electron-vite 构建 | 通过 |
| Windows ia32 安装包与包内审计 | 通过，`PACKAGED_APP_OK version=2026.9.15002 arch=i386 asar=46513189` |
| 后端面试专项测试 | 环境阻塞：后端 node_modules 未安装，`tsc`/`vitest` 不可用 |
| Windows 实机截图/录屏/投屏和鼠标穿透 | 待用户验收 |
| Authenticode 正式签名与 VirusTotal 复测 | 待用户签名后执行 |

## 性能与隐私实现证据

- Windows 两个悬浮框创建、显示前和每次重新显示均调用 `applyAllProtections`；只有读回 `WDA_EXCLUDEFROMCAPTURE` 且 `verified=true` 才显示。
- 防捕获看门狗默认 500ms 检查；检测到亲和性未知或恢复失败立即隐藏窗口，再由下一次用户打开重新校验。
- `setIgnoreMouseEvents(true, { forward: true })` 在创建、显示、移动、缩放和截图恢复路径持续设置。
- 面试请求在客户端统一使用上下文限长；服务端简洁模式上限 800 tokens，详细模式保留 1200 tokens；未完成 ASR 片段仍使用 6 秒合并窗口，完整句子使用 1.4 秒窗口。

## Windows 测试包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260915-02/QuizMate-Windows-2026.9.15002.exe`
- 大小：82,808,355 字节
- SHA-256：`28F22C3ADDCF4C34171445849C67F08F321DA80C960037DFC56AC22361314228`
- Authenticode：`NotSigned`（等待用户使用正式证书签名）
