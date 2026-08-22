# CHG-20260822-17 发布证据

- 发布版本：`2026.8.22.5`
- GitHub 仓库：`xiaoer4585/quizmate`（private）
- 提交：`952153f`、`25375ff`、`d59fae3`
- 标签：`mac-build-20268225-20260822220531`
- GitHub Actions run：`32577692376`
- Actions Secrets：`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`；证据不记录值。

## 构建与交付

- Intel job `97051628535`：类型检查、构建、ad-hoc 重签名、DMG 校验、x86_64 架构校验、OSS 上传回读通过。
- Apple Silicon job `97051628688`：类型检查、构建、ad-hoc 重签名、DMG 校验、arm64 架构校验、OSS 上传回读通过。
- Release job `97051979560`：四个规范文件名资产发布通过。
- GitHub Release：`https://github.com/xiaoer4585/quizmate/releases/tag/mac-build-20268225-20260822220531`

## 对象校验

- `downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.5.dmg`：126907732 字节。
- `downloads/QuizMate-Mac-Intel-2026.8.22.5.dmg`：130566897 字节。
- `mac/QuizMate-Mac-arm64-2026.8.22.5.zip`：126885045 字节，SHA-256 `D30D18D21840A19170F74390D1173E5961608BF40937BC68400541256A2A1FBA`。
- `mac/QuizMate-Mac-x64-2026.8.22.5.zip`：128991152 字节，SHA-256 `06996AC6F87D0639217036EB62BEBEE17E9F8359B6DD995A6A18CC4026990A72`。
- GitHub Release 大小与 `quizmate-cn` 对象大小一致。

## 版本与公网

- Intel 与 Apple Silicon ZIP 内主应用 `Info.plist`均为 `CFBundleShortVersionString=2026.8.22`、`CFBundleVersion=2026.8.22.5`。
- `mac/latest-mac.yml` 回读版本为 `2026.8.22.5`，arm64/x64 路径、大小和 SHA-512 完整。
- `download.html` 回读显示 `2026.8.22.5`，Apple Silicon/Intel 链接均指向 `.5` DMG。
- 求职插件显示“升级版本开发中...敬请期待”；安卓端显示“标准（适用学习通）”。
- 双 DMG、双 ZIP、`mac/latest-mac.yml`、`download.html` 六个 `quizmate.cn` URL 均返回 HTTP 200。

## 回滚

- 发布前 `mac/latest-mac.yml` 和 `download.html` 已备份到 `quizmate-cn/rollback/CHG-20260822-17/`。
- 上一稳定版本化对象保留，回滚时恢复上述两个入口对象即可。
- 未向 `quizmate-vip` 上传客户端、更新清单或官网文件。
