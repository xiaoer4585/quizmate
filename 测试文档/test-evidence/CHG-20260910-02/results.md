# CHG-20260910-02 自动化证据

- 变更前回滚包：`_build/windows-companion-20260909-4/QuizMate-Windows-2026.9.8006.exe`。
- 变更目标：独立 Windows 面试服务按静音窗口完成长语音轮次，不因中间句末标点提前创建第二个 AI 任务；请求上下文在发送前压缩到服务边界。
- 自动化结果：独立服务测试 14/14、共享测试 65/65、Windows Node/Web 类型检查通过；ia32 NSIS 构建通过。
- 包校验：`node scripts/verify-packaged-app.cjs release/win-ia32-unpacked` 输出 `PACKAGED_APP_OK version=2026.9.8009 arch=i386`；保护审计输出 `PROTECTED_BUILD_OK`。
- 安装包：`_build/windows-companion-20260910-02/QuizMate-Windows-2026.9.8009.exe`，82,822,756 字节，SHA-256 `427B2277999407DF4C69BC6EE289FDF05CE97C8FD2EA51B3D3641DAC91FC5F86`。
- blockmap：SHA-256 `1A3848D0BB3142379331E39F381E23743CCA2766210C9409C94B686A53761E3D`。
- 更新地址：包内为 `https://quizmate.cn/temp/CHG-20260910-02/suite/`，仅为隔离测试地址；未上传、未上线、未修改正式 `latest.yml`。
- 原验证脚本首次使用 `release/win-unpacked` 失败，改用实际 ia32 输出目录 `release/win-ia32-unpacked` 后通过；不影响安装包。
- 必须完成：独立服务测试、共享测试、Windows Node/Web 类型检查、ia32 NSIS 构建、包内校验、保护审计。
- 实机边界：真实 Windows 音频、真实账号 AI 请求、安装卸载和回滚仍需用户实机验收。
