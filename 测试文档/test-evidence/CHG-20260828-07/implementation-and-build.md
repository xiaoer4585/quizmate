# CHG-20260828-07 实施与构建证据

## 1. 实施

- Mac 内部版本：`2026.8.28004`；业务版本：`2026.8.28.4`。
- Intel CI runner：`macos-26-intel`；Apple Silicon CI runner：`macos-26`。
- ad-hoc 构建使用固定直接依赖 `@electron/osx-sign@1.0.5`，从最深层 Mach-O、Framework、Helper 到主应用逐层使用身份 `-` 重签。
- 保留 Hardened Runtime；主应用继续使用项目 entitlements，Electron 嵌套组件使用 signer 的组件专用默认 entitlements。
- CI 枚举最终 DMG 中全部 Mach-O，逐项执行严格签名验证并比较 TeamIdentifier；任一嵌套组件与主程序不一致立即失败。
- CI 从最终 DMG 挂载点直接运行目标架构程序，要求在 macOS 26 持续存活至少 10 秒，并扫描 dyld/Team ID 错误。
- 官网、正式下载对象、`mac/latest-mac.yml`、Windows 和用户自动更新通道均不在范围内。

## 2. Windows 代码工作站自动化

执行时间：2026-08-28 19:20～19:23 +08:00。

| 检查 | 结果 |
|---|---|
| Workflow YAML 解析与 runner matrix | 通过；Intel=`macos-26-intel`，Apple Silicon=`macos-26` |
| `npm run typecheck:node` | 通过，0 错误 |
| `npm run typecheck:web` | 通过，0 错误 |
| `npm run test:shared` | 通过，2 文件 9 用例 |
| `npm run test:mac-protection` | 通过，1 文件 4 用例 |
| `npm run build` | 通过，main 30 / preload 1 / renderer 1723 模块 |
| package-lock 一致性 | 通过；版本与 `@electron/osx-sign@1.0.5` 固定直接依赖一致 |
| 凭据模式扫描 | 通过；无访问密钥、签名 URL、令牌或私钥 |
| `git diff --check` | 通过 |

修改后关键文件 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `.github/workflows/mac-client-build.yml` | `003DABCB75F75002FF79A3E75DF57722A5A2D56F9066E1019628C0A568957E02` |
| `mac客户端/QuizMate-Mac/package.json` | `730FA0AC4B82BE84312A4EB019E5920080E40B4B6551CE0D6B7F98DF6BBB56ED` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `A61B52AE02F6305882D25D88BD8DD929B615C5BFFAC11C2973457DC3A962A0FD` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `B3F04D5C372D2898B920915F826C4CCD252E629013FA64CB1970AA7DD8C0B8B3` |

## 3. macOS 26 CI 与 OSS

待构建后补充。实体 macOS 26 安装启动仍须以用户复测为最终 PK-022 手工结论。
