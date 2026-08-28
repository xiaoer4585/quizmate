# CHG-20260828-06 实施与构建证据

## 1. 实施结果

- `MacProtection.applyAllProtections()` 在窗口首次显示前统一应用：
  - `setContentProtection(true)`；
  - `setFocusable(false)`；
  - `setIgnoreMouseEvents(true, { forward: true })`；
  - `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`；
  - `setAlwaysOnTop(true, 'screen-saver')`；
  - `setSkipTaskbar(true)`。
- watchdog 每个周期幂等恢复输入穿透、全工作区/全屏辅助、屏保级置顶和内容保护请求。
- `always-on-top-changed=false` 触发带防重入守卫的立即恢复。
- stop 或窗口销毁后清理 timer 和 listener。
- Renderer 未增加关闭内容保护或鼠标穿透的 IPC；保留现有 `resizable=true` / `movable=true`。
- 版本：内部 `2026.8.28003`，业务 `2026.8.28.3`。

## 2. 本地自动化

执行环境：Windows 11 x64 代码工作站，2026-08-28 17:04～17:09 +08:00。

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过，0 错误 |
| `npm run typecheck:web` | 通过，0 错误 |
| `npm run test:shared` | 通过，2 文件 9 用例 |
| `npm run test:mac-protection` | 通过，1 文件 4 用例 |
| `npm run build` | 通过，main 30 / preload 1 / renderer 1723 模块 |
| GitHub Actions workflow YAML | 通过，`js-yaml` 可解析 |
| entitlements plist XML | 通过 |
| 版本一致性 | 通过，package/lock `2026.8.28003`，业务配置 `2026.8.28.3` |
| 禁止路径扫描 | 通过；无 `setIgnoreMouseEvents(false)`、保护关闭 IPC、私有 CGS、注入或 Dock 隐藏路径 |
| 变更文件凭据扫描 | 通过 |
| `git diff --check` | 通过 |

修改后关键文件 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/helpers/MacProtection.ts` | `CB981DE9F6FA482122CEA0828580B3C7A0286380E82F1ED4C8B9BB131DB927F7` |
| `desktop-core/electron/helpers/__tests__/MacProtection.test.ts` | `86F50632BAEEA8C3B2E16D23B457CB51ADBD4E62AD35CDEFD7A17DF3DB093B15` |
| `mac客户端/QuizMate-Mac/package.json` | `4D2FED32ACA33317F29CBBE0CBCBAD893FC5039F415D2AFD4564634E73D63123` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `06C6590736C0D1CFBE8828FA526566611FA0EA7372F8FA812FAD0A979B573D21` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `ADF1084E756AFFB24BC0ABC5102C968E5B35C9696F9075E277E31F213B7B321F` |
| `.github/workflows/mac-client-build.yml` | `BA097DBA5397018A996A56CAEA591E9D6AE3ABEBD59D50BC3ACBDED05AA43017` |

## 3. GitHub Actions 双架构安装包

### 首次运行（保留失败证据）

- Run：`33158395543`
- 标签：`mac-release-2026.8.28.3`
- 提交：`a1869e3489c2c0c6414eb35233a362c17616f37d`
- Intel/Apple Silicon 的 checkout、依赖、类型检查和全部测试均通过。
- 两个架构均在 electron-builder 打包阶段失败：`QuizMate-Mac/*** doesn't exist`。
- 日志确认 `MAC_SIGNED_BUILD=true`、`MAC_NOTARIZE=true`，失败发生在证书导入前；`MAC_CSC_LINK` 被解释为 runner 本地路径，但该路径不存在。
- 修复：工作流增加证书输入规范化和 PKCS#12 预检，支持原始 Base64、`base64:`、PKCS#12 Data URL、HTTPS 和 runner 本地文件；Base64 解码到 `$RUNNER_TEMP`，使用 `MAC_CSC_KEY_PASSWORD` 做 `openssl pkcs12 -noout` 验证，日志不输出证书或密码。

### 第二次运行（证书 Secret 内容阻塞）

- Run：`33158759642`
- 标签：`mac-release-2026.8.28.3-r2`
- 提交：`55b0cb082a7f5525196d91797072030e128329d5`
- 两个架构均完成 checkout、依赖、类型检查和全部测试，随后在“Configure signing and notarization gate”一致失败。
- 明确错误：`Decoded MAC_CSC_LINK is empty`。说明 Secret 非空，但内容不是可解码的 PKCS#12 Base64/URL/runner 文件；结合首轮“路径不存在”可确定当前值不是实际 `.p12` 文件内容。
- 所需外部修复：把包含 Developer ID Application 私钥的 `.p12` 文件完整 Base64 内容写入 `MAC_CSC_LINK`，而不是本机文件路径、证书名称或占位符；`MAC_CSC_KEY_PASSWORD` 必须是导出该 `.p12` 时设置的密码。
- 在 Secret 修正前，不降级生成 ad-hoc 包，避免再次出现 Gatekeeper/TCC 身份不稳定问题。

## 4. 实体 Mac 阻塞项

- Intel 与 Apple Silicon 的 DMG 安装、Gatekeeper 首次启动和覆盖安装。
- Space/全屏/多显示器/睡眠唤醒后的窗口行为。
- 底层应用点击、滚动和移动的永久穿透。
- 系统截图、命令行截图与指定 ScreenCaptureKit 工具的组合矩阵。
- TCC 一次性迁移、统一授权、真实截图/AI、真实扬声器和持续面试回归。

## 5. 回滚检查

- 基线提交：`034c721a75383b3c87a1b81c1bae8a513431d08a`。
- 本次无数据库、后端、账号、积分或 TCC 标记迁移。
- 代码使用 Git revert 回滚；测试安装包可删除 GitHub prerelease/标签撤回。
- 官网、OSS 正式对象、`mac/latest-mac.yml` 和用户更新通道未修改。
