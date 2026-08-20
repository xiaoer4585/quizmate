# CHG-20260820-03 测试证据

## 变更前复现与根因

- 生产版本：`2026.8.18`。
- arm64/x64 ZIP 内 `Info.plist` 的 `CFBundleShortVersionString`、`CFBundleVersion` 均为 `2026.8.18`。
- 两个 ZIP 内 `app-update.yml` 均指向 `https://quizmate.cn/mac/`。
- 生产包仅为 ad-hoc 临时签名，无 Developer ID TeamIdentifier 和 Apple 公证。
- 旧更新器下载 ZIP 后 1.5 秒调用 `quitAndInstall(false, true)`，临时签名构建无法保证可靠的应用替换与签名校验。

## 本地自动化

执行环境：Windows 11 x64，Node.js `v24.18.0`，目标版本 `2026.8.20`。

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run build` | 通过；main/preload/renderer 均成功生成 |
| 版本比较：高于、等于、低于、`v` 前缀、尾随 `.0` | 5 项通过 |
| 扫描 `autoUpdater.downloadUpdate`、`quitAndInstall`、自动退出安装 | 通过；业务源码无匹配 |
| `git diff --check` | 通过；仅工作区换行提示，无空白错误 |

## 待云端与生产验证

- 实体 Mac 启动、覆盖安装、权限恢复与 Gatekeeper：阻塞，需 Intel/Apple Silicon 实机补测。
- Developer ID 正式签名、公证、stapling：阻塞，当前未提供 Apple 开发者证书。

## GitHub Actions 与包内验证

- 成功运行：`32338024616`，提交 `2655b50`。
- Intel/Apple Silicon 均通过依赖安装、Node/Web 类型检查、Electron 构建、ad-hoc 重签名、`hdiutil verify`、代码签名校验和可执行文件架构检查。
- Intel：Mach-O thin `x86_64`；Apple Silicon：Mach-O thin `arm64`。
- 两包均为 `Signature=adhoc`、`TeamIdentifier=not set`，与当前无 Apple Developer ID 的发布边界一致。
- 两个 ZIP 内 `CFBundleShortVersionString` 均为 `2026.8.20`，更新源均为 `https://quizmate.cn/mac/`。
- 两个 ASAR 均包含 Apple Silicon/Intel 手动 DMG URL；均不包含 `quitAndInstall` 或 `autoUpdater.downloadUpdate`；`allowDowngrade=false`、`autoInstallOnAppQuit=false` 均存在。
- 首次直传运行因签名 URL 未包含 `Content-Type` 返回 403；加入对应类型签名并用临时 PUT 探针验证后重跑成功。失败运行与临时交付标签已删除。

## 正式产物

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `QuizMate-Mac-Apple-Silicon-2026.8.20.dmg` | 126888428 | `1601AACD0A01D5762AC37A5D9E444C7C3B3E695C2FF67F36222B9B821368760B` |
| `QuizMate-Mac-Intel-2026.8.20.dmg` | 130583188 | `1DAC3B46569C7F1411D1099241D1302D5B4337FECB53E967A62A54714CA04E47` |
| `QuizMate-Mac-arm64-2026.8.20.zip` | 126876014 | `2EFBDE4B4B449129A71FC18CC82556550E7232911184F68052CF2AF8A2271890` |
| `QuizMate-Mac-x64-2026.8.20.zip` | 128982122 | `98E28348F564EE6F4DC6E5A47CEAC518B06112C2E27668872654CDB594564680` |

## 生产发布

- `quizmate-cn`、`quizmate-vip` 两桶均在上传前备份已有清单与下载页，并对六个正式对象逐个上传后完整回读校验 SHA-256。
- `quizmate.cn` 与 `www.quizmate.vip` 的 `download.html`、`mac/latest-mac.yml`、两个 DMG 和两个 ZIP 均返回 HTTP 200。
- 公网清单版本为 `2026.8.20`，四个大文件 `Content-Length` 与本地正式产物逐字节一致。
- 临时云构建交付对象和时效签名标签已删除；正式生产对象和两桶回滚备份保留。

## 回滚

- 代码回滚点：`f4819e3`。
- 生产回滚对象：发布脚本上传前复制至 `rollback/CHG-20260820-03/`。
- 无数据库、账号、积分或本地数据迁移。
