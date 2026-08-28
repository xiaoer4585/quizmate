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

### macOS 26 双架构构建

- Run：`33167171455`。
- 构建提交：`2546c160ac41fad43209909521c167f49b94e3db`。
- Apple Silicon job `98835237694`：success，运行于 macOS 26 ARM runner。
- Intel job `98835237549`：success，运行于 macOS 26 Intel runner。
- 两个 job 均通过：依赖、Node/Web 类型检查、共享 9 用例、MacProtection 4 用例、production build、逐层 ad-hoc 重签、DMG `hdiutil verify`、目标架构、全部 Mach-O 严格 codesign、Team ID 一致性、最终 DMG 内应用启动存活 10 秒、SHA-256、OSS 直传。
- 每个架构检查 16 个主程序/嵌套签名身份；TeamIdentifier 唯一值均为 ad-hoc 预期的 `not set`，不再保留 Electron Framework 的不同 Team ID。
- 两个最终应用在 macOS 26 原生架构直接启动并持续存活 10 秒，日志无 `Library not loaded`、`different Team IDs`、`Namespace DYLD` 或 `dyld Code 1`。
- 临时交付标签含短期 PUT 签名，OSS 上传和回读后已从构建仓库及本地删除。

### 阿里云 OSS 隔离交付

- Bucket：仅 `quizmate-cn`；前缀：`temp/mac-os26-signing-2026.8.28.4/`。
- 未触碰 `quizmate-vip`、官网、`mac/latest-mac.yml`、正式下载对象或用户自动更新通道。

| 架构 | 对象 | 大小 | SHA-256 | OSS ETag | 验证 |
|---|---|---:|---|---|---|
| Apple Silicon arm64 | `QuizMate-Mac-arm64-2026.8.28004.dmg` | `109,465,779` | `7fe2fb194ec08aa8283448418de366fc0fb08604d3b1009385d3c0565dcf67bd` | `BB75C23381FCCCAA4610C1819AD51E2F` | HEAD 200、签名 GET 200、完整流式回读 SHA-256 匹配 |
| Intel x64 | `QuizMate-Mac-x64-2026.8.28004.dmg` | `117,902,148` | `d8a9d057aea2b3a82ac011529d435d7281d870cc2aa7b0cac5a26734072f96e0` | `187D89E3491CEF16F3BED38932A6CCF9` | HEAD 200、签名 GET 200、完整流式回读 SHA-256 匹配 |

- 用户临时 GET 链接有效至 2026-09-04 19:31 +08:00；签名 URL 不写入 Git。
- Actions 的 Node 20 强制切换 Node 24 与 `npm audit` 注册表返回 exit 1 为非阻断警告；构建、签名、启动和上传步骤全部成功。
- 实体 M1 Pro / macOS 26.5.2 的安装启动仍须用户用本轮 arm64 包复测，PK-022 手工结论在复测前保持阻塞。
