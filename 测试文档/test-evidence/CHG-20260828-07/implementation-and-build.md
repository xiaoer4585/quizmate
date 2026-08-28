# CHG-20260828-07 实施与构建证据

## 1. 实施

- 失败中间版本：`2026.8.28004`；业务版本：`2026.8.28.4`。新目标内部版本：`2026.8.28005`；业务版本：`2026.8.28.5`。
- Intel CI runner：`macos-26-intel`；Apple Silicon CI runner：`macos-26`。
- ad-hoc 构建使用固定直接依赖 `@electron/osx-sign@1.0.5`，从最深层 Mach-O、Framework、Helper 到主应用逐层使用身份 `-` 重签。
- 保留 Hardened Runtime；无证书测试包只使用 `entitlements.mac.adhoc.plist`，对主应用和所有 Electron Helper 可执行宿主显式设置 `com.apple.security.cs.disable-library-validation=true`；正式 Developer ID 路径继续使用最小生产 entitlements，禁止该放宽。
- CI 枚举最终 DMG 中全部 Mach-O，逐项执行严格签名验证并比较 TeamIdentifier；同时从每个 `Contents/MacOS/*` 可执行宿主读回 entitlement。ad-hoc 宿主缺少例外或正式宿主带有例外均立即失败。
- CI 从最终 DMG 挂载点直接运行目标架构程序，要求在 macOS 26 持续存活至少 10 秒，并扫描 dyld/Team ID 错误。
- 官网、正式下载对象、`mac/latest-mac.yml`、Windows 和用户自动更新通道均不在范围内。

## 2. Windows 代码工作站自动化

首次执行时间：2026-08-28 19:20～19:23 +08:00。针对实体失败的修正重跑：2026-08-28 20:02～20:04 +08:00。

| 检查 | 结果 |
|---|---|
| Workflow YAML 解析与 runner matrix | 通过；`js-yaml` 解析成功，Intel=`macos-26-intel`，Apple Silicon=`macos-26` |
| `npm run typecheck:node` | 通过，0 错误 |
| `npm run typecheck:web` | 通过，0 错误 |
| `npm run test:shared` | 通过，2 文件 9 用例 |
| `npm run test:mac-protection` | 通过，1 文件 4 用例 |
| `npm run build` | 通过，main 30 / preload 1 / renderer 1723 模块 |
| package-lock 一致性 | 通过；内部版本 `2026.8.28005` 与 `@electron/osx-sign@1.0.5` 固定直接依赖一致，业务版本为 `2026.8.28.5` |
| ad-hoc/正式 entitlement 隔离 | 通过；ad-hoc plist 含 library-validation 例外，正式 plist 不含该例外 |
| 凭据模式扫描 | 通过；无访问密钥、签名 URL、令牌或私钥 |
| `git diff --check` | 通过 |

修改后关键文件 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `.github/workflows/mac-client-build.yml` | `12879824208BAF7CDDA102AFE54CCE7E7A5E52DE8C13792BDC7D6A9906E3184F` |
| `mac客户端/QuizMate-Mac/package.json` | `3B935E9C4DC798A906D3EE26011C191EA3D99DFD069B39DEA16AF86E0E28FCC4` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `AFA91E856621C65BF151E5CB73F795EE5792F69499A303D008CA1287BC4EBE14` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `B3021013B4B8DCBD672D7DE927978FD2ACD0D8663A449D15BF9AEF455EEE9194` |
| `mac客户端/QuizMate-Mac/resources/entitlements.mac.adhoc.plist` | `179CBF045AD6A3B8CF3491868A18102790AAC936F57B047A937817D7C96B25EE` |

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
- 实体 M1 Pro / macOS 26.5.2 已复测失败，PK-022 标记为失败，本轮 `2026.8.28004` 不再交付。

## 4. `2026.8.28004` 实体失败与根因修正

- 失败时间：2026-08-28 19:52:48 +08:00。
- 实体环境：MacBookPro18,3 / Apple M1 Pro / ARM64 原生 / macOS 26.5.2，SIP enabled，完整代码签名监控启用。
- 报告版本明确为 `2026.8.28004`，排除用户仍启动旧包。
- 进程从 launch 到终止约 55ms，异常仍为 `EXC_CRASH (SIGABRT)`、`Namespace DYLD Code 1`、Electron Framework `Library missing`，具体原因仍是 mapped file 与 process Team ID 不同。
- 上轮 CI 假阴性原因：逐层 ad-hoc 重签后所有组件的公开 `TeamIdentifier` 都显示 `not set`，但这不等于存在一个真实共同 Team ID；实体 macOS 26.5.2 在 Hardened Runtime library validation 下仍按不同 ad-hoc 身份拒绝 Framework。runner 的启动存活不能替代实体完整安全策略。
- 修正方案：新增 ad-hoc 专用 entitlements，并对主程序及全部 Electron Helper 显式加入 Apple 公共 entitlement `com.apple.security.cs.disable-library-validation=true`；保留 Hardened Runtime。正式 Developer ID/公证路径继续使用原 `entitlements.mac.plist`，不加入该例外。
- 新 CI 门禁：从最终 DMG 中逐个读回所有 `Contents/MacOS/*` 可执行宿主的 entitlements，缺少 library-validation 例外即失败；随后继续执行 macOS 26 原生启动、签名、DMG、架构和 SHA-256 检查。
- 原始报告的用户/设备标识未写入仓库。
