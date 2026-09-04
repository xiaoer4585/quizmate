# CHG-20260905-01 本地自动化结果

- 时间：2026-09-05 +08:00
- 目标版本：公开 `2026.09.05`；内部 SemVer `2026.9.5000`
- Windows `npm run typecheck:node`：通过
- Windows `npm run typecheck:web`：通过
- Windows `npm run test:shared`：通过，5 个文件、31/31 项
- Windows `npm run build`：通过
- Mac `npm run typecheck:web`：通过
- Mac `npm run build`：通过
- Mac `npm run typecheck:node`（Windows 主机）：阻塞；`MacProtection.test.ts` 无法从 Windows 当前壳层解析 `vitest` 类型，与 CHG-20260904-01/03 的已知环境限制一致，必须由 macOS GitHub Actions 复核。

## 专项断言

- DT-066：工作台源码只派发 `quizmate:open-recharge`，由 `MainLayout` 打开和右上角积分按钮相同的 `RechargeModal`；不再调用 `api.system.openRecharge()`。
- DT-067：网申页只调用 `api.system.openExternal('https://www.quizmate.cn/download.html#ai-career-tools')`；不调用 `api.extension.downloadLatest`，不含固定 ZIP 文件名。

## 修改后关键文件 SHA-256

- `desktop-core/src/pages/Dashboard.tsx`：`02850740B365DB4B2396DCF9667281D7E47B1DC86D8E7AB9A80DA702B4B83D24`
- `desktop-core/src/pages/Extension.tsx`：`72A998DF9735FA660BFAC431E294966540FCCE8CD6B38C6528F0A146852E09D9`
- Windows `package.json`：`B08BDD45AC32D1B071AB5D64752321BF75162563C154FB60819E624694B5BE17`
- Windows `package-lock.json`：`EAF0C1334B01DBFA079F543D84397E49882D72B7B09BF346C04CAB43CA60E002`
- Windows `resources/config.json`：`3D22F249D42F8B108BF24A148D54BC38305FA3B3AD66977A0B390154D9A27E5A`
- Mac `package.json`：`F0A5C83F72DB40BBC4D14D81C5C963D293A85ED9AF1443D5FB8ED1B43BA48435`
- Mac `package-lock.json`：`8DE667EAFE63CB0139DC44D507ABDF3A9D5925BA38E457B051A25970DE08225C`
- Mac `resources/config.json`：`53F892F1ED7530D87928E98785F5B28CDB84068D04B66DF32F36B5FB3B6A0916`

> 发布范围调整：只上线 Windows。Mac 双架构 CI 仅作为后续测试产物，不上传生产、不更新 `mac/latest-mac.yml` 和官网 Mac 映射。

## 正式发布补充结果

- Windows GitHub Actions：运行 `33894854730`，提交 `1558599dca104dd948c517d060a6962194faed47`，`Windows ia32 universal installer` 成功。
- Windows 正式安装包：`82,858,936` 字节，SHA-256 `EDCCFF84659ED5D65643157321CF61897AD1545016177DF296D3D4E1B95BBE6D`；blockmap SHA-256 `1D3525CA0B74A96BC5E5F4DB0B75C5BAC9AAC616D57E8966946D32F3544901AA`。
- 包内检查：`PACKAGED_APP_OK version=2026.9.5000 arch=i386`，安装器和主程序均为 ia32 通用包，`app-update.yml` 指向 `https://quizmate.cn/suite/`。
- 更新清单：`https://www.quizmate.cn/suite/latest.yml` 与 `https://www.quizmate.cn/downloads/latest.yml` 内容一致，内部版本 `2026.9.5000`，文件大小与正式包一致。
- 公网安装包：`/suite/QuizMate-Windows-2026.09.05.exe` 与 `/downloads/QuizMate-Windows-2026.09.05.exe` Range 请求均返回 HTTP 206，`Content-Range` 总大小均为 `82,858,936`。
- 官网：Windows 入口命中 `2026.09.05`；`download.html#ai-career-tools` 锚点存在；Mac Intel/Apple Silicon 卡片继续命中 `2026.08.29`。
- 反馈/公告：生产 `getClientAnnouncements` HTTP 200；未登录 `submitFeedback` HTTP 401 `AUTH_REQUIRED`；无管理员凭据 `adminListFeedback` HTTP 403 `ADMIN_AUTH_FAILED`；后台页面 HTTP 200。
- 回滚对象：`quizmate-cn/rollback/CHG-20260905-01/`；反馈后端 `/opt/quizmate-api-shadow.rollback-feedback-CHG-20260905-01-20260905-002708`；后台 `rollback/CHG-20260905-01/admin-web.index.before-feedback.html`。
- Mac 未发布：运行 `33894856815` 已取消；正式触发标签已删除；`mac/latest-mac.yml` 仍为 `2026.8.29000` / `2026.08.29`；四个 Mac `2026.09.05` 生产 URL 均 HTTP 404。
- 本地清理：已按精确白名单删除 Windows/Mac `out`、Windows `release`、Mac 测试证据中的两个 `release` 二进制目录、部署临时压缩包和 31,457,280 字节的残缺历史副本；本次正式包、2026.08.29 历史正式包及文字日志已复核保留。

> 尚待用户安装后人工复核：DT-066 两个充值入口的弹框交互，以及 DT-067 网申按钮调用默认浏览器的最终桌面体验。该项不改变已完成的 Windows 生产发布事实；Mac 仍不得进入生产。
