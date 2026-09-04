# CHG-20260904-02 自动化与契约测试结果

- 执行环境：Windows 11 x64，PowerShell，Node.js / npm
- 执行时间：2026-09-04 +08:00
- Git 基线：`4d34c9e401811f63f869fc8b5056bd49f52b1329`
- 结论：客户端编译、类型检查、共享状态测试、专项后端测试和安装包静态门禁通过；生产后端新增 action 尚未部署，反馈、公告和动态网申下载的公网联调阻塞。

## 通过项

| 检查 | 结果 |
|---|---|
| Windows `npm run typecheck:web` | 通过 |
| Windows `npm run typecheck:node` | 通过；首次因本地缺少 lockfile 已声明的 Vitest 包失败，执行 `npm install --include=dev --ignore-scripts` 后复跑通过 |
| Windows `npm run build` | 通过；main 31 modules、preload 1 module、renderer 1725 modules |
| Windows `npm run test:shared` | 3 个测试文件、16 项通过 |
| 后端 `npm run typecheck` | 通过 |
| 后端专项测试 | `input-extension-download`、`feedback-actions`、`action-registry` 共 3 个文件、7 项通过 |
| 本轮文件 `git diff --check` | 通过；全仓库另有与本轮无关的既有官网文件尾随空格，不纳入本轮修改 |
| 打包渲染 bundle 文案门禁 | “问题反馈”“检测更新”“开始面试”“结束面试”“正在截取屏幕”“正在获取最新版本”均存在 |

## 已知非本轮失败与风险

- 后端全量测试：31 个测试文件中 30 个通过；143 项中 141 项通过、2 项失败。失败均来自 `credit-account-platform.test.ts` 对旧 SQL 文本 `SELECT s.platform` / `s.platform = $1` 的断言与当前已有平台归一化 SQL 不一致，不涉及本轮反馈、公告或动态下载 action。
- `npm audit --omit=dev` 报告运行依赖 3 项已知漏洞（2 moderate、1 high、0 critical）。本轮没有执行可能引入破坏性升级的自动修复。
- Windows 界面自动化启动解包包时被系统已安装的 QuizMate 应用注册重定向到旧版 `2026.8.29`。旧版窗口已关闭，未把其界面结果计作新包通过证据；新包真实登录、快捷键、听写和截图搜题由安装后手工复测。

## 生产 API 契约探测（无认证、无写入）

目标：`https://api.quizmate.vip/study-auth-api`

| action | HTTP | 返回 |
|---|---:|---|
| `getClientAnnouncements` | 400 | `UNKNOWN_ACTION / 未知操作` |
| `getInputExtensionDownload` | 400 | `UNKNOWN_ACTION / 未知操作` |
| `submitFeedback` | 400 | `UNKNOWN_ACTION / 未知操作` |

结论：问题反馈提交失败确实是生产后端未部署对应 action，不是本轮客户端表单没有发起请求。遵守“先测试、不上线”边界，本轮未部署生产后端或后台页面。
