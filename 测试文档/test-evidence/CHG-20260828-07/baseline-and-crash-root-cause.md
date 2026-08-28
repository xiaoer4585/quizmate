# CHG-20260828-07 基线与崩溃根因

## 基线

- Git 基线：`ccdcbc517dde754f9938f75a03567c3adff882d2`。
- 失败包内部版本：`2026.8.28003`；业务版本：`2026.8.28.3`。
- 目标修复内部版本：`2026.8.28004`；业务版本：`2026.8.28.4`。
- 失败实体环境：Apple M1 Pro（ARM64 原生）、macOS 26.5.2。

| 文件 | 修改前 SHA-256 |
|---|---|
| `.github/workflows/mac-client-build.yml` | `33189EA3733B434F8F698C21F3D7135AAC4AB1CAD64906E194870774ABD09995` |
| `mac客户端/QuizMate-Mac/package.json` | `4D2FED32ACA33317F29CBBE0CBCBAD893FC5039F415D2AFD4564634E73D63123` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `06C6590736C0D1CFBE8828FA526566611FA0EA7372F8FA812FAD0A979B573D21` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `ADF1084E756AFFB24BC0ABC5102C968E5B35C9696F9075E277E31F213B7B321F` |

## 脱敏崩溃事实

- 进程路径：`/Applications/QuizMate.app/Contents/MacOS/QuizMate`。
- Code Type：`ARM-64 (Native)`；排除架构串包。
- 异常：`EXC_CRASH (SIGABRT)`。
- 终止：`Namespace DYLD, Code 1, Library missing`。
- 未加载库：`@rpath/Electron Framework.framework/Electron Framework`。
- dyld 明确原因：主进程与映射的 Electron Framework 为非平台代码且 Team ID 不一致。
- 崩溃发生在 dyld 装载阶段，应用 JavaScript、权限向导、截图、音频和 AI 逻辑均未开始运行。
- 原始报告中的用户 ID、Crash Reporter Key、Incident ID、设备标识等未写入仓库。

## 根因

旧工作流对已打包 `.app` 执行一次 `codesign --force --deep --options runtime --sign -`。该命令通过 `codesign --verify --deep --strict`，但没有保证 Electron Framework、Helpers 与主程序在 macOS 26 Hardened Runtime 动态库映射时使用同一签名身份。macOS 26 因 Team ID 不一致在启动前拒绝加载 Framework。

## 修复验收

1. 使用 Electron 官方签名工具从最深层 Mach-O/Framework/Helper 到主应用逐层统一 ad-hoc 签名。
2. macOS 26 CI 校验主程序、Electron Framework 和所有 Helper 的 TeamIdentifier 一致；ad-hoc 预期均为 `not set`。
3. 从最终 DMG 挂载点直接启动应用，至少持续存活 10 秒；退出日志不得包含 dyld Team ID/Framework 加载失败。
4. Intel 与 Apple Silicon 分别通过 DMG、架构、codesign、启动存活和 SHA-256 门禁。
5. 新包仅上传 `quizmate-cn/temp/mac-os26-signing-2026.8.28.4/`，不修改官网或正式更新通道。
