# CHG-20260815-03 发布验证结果

- 执行时间：2026-08-15 +08:00
- 构建基线：`a74c217`，Mac 客户端版本 `2026.8.13`
- 构建环境：GitHub Actions `macos-14`，Node 22，electron-builder

## 静态与快捷键检查

- `npm.cmd run typecheck:node`：通过。
- `npm.cmd run typecheck:web`：通过。
- `verify-shortcut-migration-20260813.cjs`：`SHORTCUT_MIGRATION_OK`。
- 默认截图/搜题：`Alt+Q` / `Alt+E`；退出：`Command+Shift+Q`；旧 `Command+W` / `Command+E` 配置迁移到新默认值。

## 双架构产物

- Apple Silicon：126,912,827 bytes；SHA-256 `F1B8EE9D27D6563CC1503C3EB157F1F583D6FC3143C7894B4D2A8BAB1D72EB5E`；SHA-512 Base64 `m7eGxyloyekSPh2/uYA7+ibxUqi9/FbTfnQ74JsZCHDHnNMelXwT2Xo57K2mNyop48z/mnNicoQsQJv3yGnVmQ==`。
- Intel：130,568,976 bytes；SHA-256 `39C6972F8BA6AA5328FA6151720C41C137EEED21E1A7A4907510C5963128BB8F`；SHA-512 Base64 `foJOmgN+B69W8QJ4KQT5h+pmvgZHA2f6wgoNfoHyHgqlyIf1tdtR0t4JKI8EIUig//qWZw+nl2qf9uyofNdg1w==`。
- macOS 日志：两份 DMG 的 `hdiutil verify` 均为 `VALID`；应用满足临时签名要求；可执行文件分别为 `Mach-O 64-bit executable arm64` 与 `x86_64`。
- 生产完整回下载后的文件长度和 SHA-256 与 macOS 构建日志一致。

## 线上验证

- `https://quizmate.cn/download.html`：HTTP 200，显示 `2026.8.13`，两个按钮均指向新包。
- Apple Silicon / Intel DMG：HTTP 200，`Content-Type: application/x-apple-diskimage`，长度与上述结果一致。
- `https://quizmate.cn/mac/latest-mac.yml`：HTTP 200，版本 `2026.8.13`，大小和 SHA-512 与线上文件一致。
- `https://update.quizmate.vip/mac/latest-mac.yml`：HTTP 200，经兼容入口读取版本 `2026.8.13`。

## 失败、修复与回滚

- 前两次 Actions 运行的 DMG 构建、架构检查和 Actions 产物均成功；仅 OSS 上传因预签名有效期和 `Content-Type` 未匹配而返回 HTTP 4xx。
- 修正签名参数后，先上传并删除独立临时对象验证 HTTP 200，再触发构建；第三次 DMG 和诊断日志均上传成功。
- 旧 `2026.8.12` DMG 未删除，可通过恢复旧 `latest-mac.yml` 和下载页链接回滚。
- macOS 实机安装、快捷键实操、Apple 正式签名与公证：阻塞，当前没有实体 Mac 和发布证书，不以构建日志替代。
