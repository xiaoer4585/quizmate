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

> 尚未执行：GitHub Actions Windows/Mac 正式打包、安装包架构和更新源检查、OSS 回读哈希、官网及更新清单切换、安装包人工复核。
