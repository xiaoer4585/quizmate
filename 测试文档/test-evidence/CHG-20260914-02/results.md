# CHG-20260914-02 验证结果

- 基线：独立分支 `codex/windows-signing-capture-hide-20260913`，上一测试提交 `22fb848`；原工作区和生产分支未修改。
- 变更：恢复后端 `getCreditLedger` 当前账号流水查询；客户端在服务节点未部署动作时返回明确错误；悬浮框启动时校正保存的屏幕外坐标；失效的 `overlayLocked` 状态允许重新创建窗口。

## 已执行检查

| 检查 | 结果 |
|---|---|
| Windows `npm run typecheck:node` | 通过（串行执行） |
| Windows `npm run typecheck:web` | 通过 |
| Windows `npm run test:shared -- --run` | 通过，10 个文件 / 74 个测试 |
| Windows `npx electron-vite build` | 通过 |
| Windows ia32 安装包与包内审计 | 通过，`PACKAGED_APP_OK version=2026.9.14002 arch=i386 asar=46511993` |
| 后端 `npm run typecheck` | 当前工作区未安装后端 TypeScript 依赖，上一轮报 `tsc is not recognized` |

## 诊断证据

- 当前生产节点 `https://api.quizmate.vip/study-auth-api`：`getAccountProfile` 返回 HTTP 200；`getCreditLedger` 返回 HTTP 400、`UNKNOWN_ACTION`。这说明线上节点尚未部署积分流水动作，客户端请求链路本身可达。
- 本机 `QuizMate` 配置曾保存悬浮框坐标 `x=1628,y=1180`，在 1920x1080 工作区外；新逻辑会将笔试和面试悬浮框完整限制在当前显示器工作区内。

## 发布边界

只构建 Windows 测试包，不部署后端、不上传、不上线、不修改官网、正式更新清单或原工作区；Mac 不构建。后端动作仅保留在本地测试分支，待确认后再安排生产部署。

测试包：`windows客户端/QuizMate-Windows/release/CHG-20260914-02/QuizMate-Windows-2026.9.14002.exe`。SHA-256：`0445AF4CF66AB887CF637AA31FCBA315BA485D3B0D7C349D0BB42D4DED87C671`。Authenticode：`NotSigned`（本机未配置签名证书）。

## 实机待验收

登录后打开积分明细、验证当前账号流水、按 Alt+B/自定义键显示悬浮框、来回切换笔试/面试、退出重启后再次打开、安装卸载和正常退出，均需用户在 Windows 实机验证。
