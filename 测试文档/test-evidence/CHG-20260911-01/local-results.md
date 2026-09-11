# CHG-20260911-01 本地实现与回归结果

- 执行时间：2026-09-11 21:39～21:45（Asia/Shanghai）
- 执行环境：Windows PowerShell；隔离工作树 `tmp/mac-companion-20260911-worktree`
- 测试版本：Mac 内部 `2026.9.11000`，公开 `2026.09.11`

## 实现结果

- Windows 与 macOS 均由 `supportsCompanionDesktopPlatform()` 开放双机协作。
- Mac 侧栏和工作台展示“双机协作笔面试”，并与 Windows 共用 mobile/pc 工作区切换。
- 主进程在两个受支持平台初始化 `CompanionController`、独立 mobile `InterviewHelper` 和全部 companion IPC。
- Mac 继续使用原生 `InterviewHelper`、`RealtimeVoiceHelper` 和 `ScreenshotHelper`，未引入 Windows 受保护 helper 别名。
- Mac `tsconfig.node.json` 增加已有 `@types/qrcode` 的明确解析路径；未新增或升级依赖。

## 首次失败与修复

1. 隔离工作树首次执行时无 `node_modules`，共享测试报 `vitest is not recognized`，Windows 类型检查提示先安装依赖。
2. 按各 wrapper 锁文件执行 `npm ci --ignore-scripts` 和 `npm run postinstall` 后重跑。
3. Mac Node 类型检查随后发现 `CompanionController` 的 `qrcode` 声明无法从共享 core 路径解析；Windows wrapper 已有显式 path，Mac 补齐同等路径后重跑通过。

## 自动化结果

| 平台/项目 | 命令 | 结果 |
|---|---|---|
| Mac 目标配置 | `npm run test:shared` | 通过，9 files / 69 tests |
| Mac 目标配置 | `npm run test:mac-protection` | 通过，1 file / 4 tests |
| Mac 目标配置 | `npm run typecheck:node` | 修复后通过 |
| Mac 目标配置 | `npm run typecheck:web` | 通过 |
| Mac 目标配置 | `npm run build` | 通过；main/preload/renderer production bundle 均生成 |
| Windows 目标配置 | `npm run test:shared` | 通过，9 files / 69 tests |
| Windows 目标配置 | `npm run typecheck:node` | 通过 |
| Windows 目标配置 | `npm run typecheck:web` | 通过 |
| Windows 目标配置 | `npm run build` | 通过；受保护 helper 别名保持生效 |
| 双平台构建产物 | 检查 main IPC 与 renderer 文案 | Mac/Windows 均包含 `companion:workspace` 和“双机协作笔面试” |
| 静态门禁 | `git diff --check` | 通过（仅 Git 行尾提示） |
| 静态门禁 | 变更文件发布边界检查 | 通过；未修改 workflow、官网或 `latest-mac.yml` |
| 静态门禁 | diff 凭据模式扫描 | 通过；未发现访问密钥、私钥或 PAT |
| 版本门禁 | Node 校验 package/config | 通过：`2026.9.11000` / `2026.09.11` |

工作流文件 SHA-256 仍为 `D7CEE0BB9B738ECE1EF20F6C3710C0FB661E24FF8F61661FBB8AE1A2DB90FD34`，与变更前一致。

## 阻塞与交付边界

- 阻塞：实体 Mac 屏幕录制/麦克风/电脑声音权限、真实截图三连拍、真实面试音频、实体手机扫码/掉线、真实账号 AI/积分、DMG 安装/覆盖/卸载、Gatekeeper 提示和旧版降级。
- 待 CI：Intel 与 Apple Silicon DMG/ZIP 架构、ad-hoc 嵌套签名、macOS 26 启动冒烟和隔离更新 URL。
- 未上线：未修改生产后端、官网、正式 OSS 路径、`mac/latest-mac.yml` 或正式更新清单；不得将 ad-hoc 测试包描述为已签名/公证的生产包。
