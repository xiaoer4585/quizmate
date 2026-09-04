# CHG-20260904-01 测试证据

时间：2026-09-04（Asia/Shanghai）

## 已执行
- Windows `npm run typecheck:web`：通过。
- Windows `npm run build`：通过，生成 `out/main/index.js`、`out/preload/index.cjs`、`out/renderer`。
- macOS 共享渲染构建 `npm run build`：通过（Windows 主机交叉构建，仅证明编译，不替代实体 Mac 权限/快捷键验收）。
- 后端 `npm run typecheck`：通过。
- 后端 `npm test -- --run`：136/138 通过；2 项既有 `credit-account-platform` 断言失败，与本次反馈/公告/快捷键改动无关，保留失败证据，未标记回归通过。

## 阻塞/待用户实机
- Windows 安装包、真实 Alt+Q 截图/搜题、录屏/投屏不可见、鼠标穿透：待生成测试安装包后手工执行 DT-044～DT-050。
- macOS Intel/Apple Silicon 实体构建、权限、全局快捷键和 AI 链路：当前 Windows 主机无法验证，标记阻塞。
- GitHub 公开仓库与 Actions、阿里云临时对象上传：尚未执行，避免未经确认的外部发布动作；官网及正式更新映射未修改。

## GitHub 与临时下载
- GitHub 仓库：公开，地址 `https://github.com/xiaoer4585/quizmate`。
- 提交：`d7663bb`，仅包含本次桌面反馈/公告/快捷键/截图改造及测试证据。
- Mac Actions：`33848151956`，Intel 与 Apple Silicon 均成功；测试预发布：`mac-build-manual-67`。
- Windows 临时包：`https://www.quizmate.vip/temp/CHG-20260904-01/QuizMate-Windows-2026.8.29000.exe`，HTTP 200，Content-Length 82858260。
- Mac 测试安装包（GitHub 预发布）：`https://github.com/xiaoer4585/quizmate/releases/tag/mac-build-manual-67`。
- 官网、正式安装包映射、latest.yml 未修改。
