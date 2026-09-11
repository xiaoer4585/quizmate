# CHG-20260912-01 发布证据

- 发布分支：`codex/resume-extension-main-20260910`（正式 main 工作树）
- Mac 发布提交：`0574ad0`（合并提交，来源提交 `c0a6fac29cb660bcefb7335ebef3019fc3de5765`）
- 版本：公开 `2026.09.12`，内部 `2026.9.12000`
- 目标：仅 `quizmate-cn` / `quizmate.cn`；Mac DMG/ZIP、`mac/latest-mac.yml`、官网下载页和 Mac 操作手册。
- 回滚目录：`quizmate-cn/rollback/CHG-20260912-01/`；旧 Mac 版本化对象保留，不删除。

## 本地验证

- Mac shared tests：69/69 通过。
- MacProtection：4/4 通过。
- Mac Node/Web typecheck：通过（Windows 文件系统不支持符号链接时由脚本回退 tsconfig paths）。
- Mac production build：通过，Electron main/preload/renderer 均产出。
- `git diff --check`：通过。
- 手册 PDF：追加页渲染为 PNG 并人工检查通过；由于当前环境无 LibreOffice，DOCX 未执行重排渲染，保留原 PDF 页面并追加验证页。

## 已验收的构建来源

- GitHub Actions：`34606435578`
- Apple Silicon DMG SHA-256：`505ae3f7beb0b2f499efe158e57b69259e86b0efad75ec1f4a1688f3bf27e497`
- Apple Silicon ZIP SHA-256：`cc25b5d6e551db9e03702d7fba53eb04cb749818150206a5acd586c3a4be69ce`
- Intel DMG SHA-256：`9046a87add3879fe9951cc2f2491d4ffbccff3833dc7fb226f9c409f171fade7`
- Intel ZIP SHA-256：`fc500aefe018c5295687e7bfbe7b210d5cdeab3585bca09bacecce91f3bd69a9`

## 发布对象

- `downloads/QuizMate-Mac-Intel-2026.09.12.dmg`
- `downloads/QuizMate-Mac-Apple-Silicon-2026.09.12.dmg`
- `mac/QuizMate-Mac-x64-2026.09.12.zip`
- `mac/QuizMate-Mac-arm64-2026.09.12.zip`
- `mac/latest-mac.yml`
- `downloads/QuizMate-客户端使用操作手册.pdf`

## CI 与公网结果

- GitHub Actions：`34626245089`；Intel/Apple Silicon 均成功，生产上传步骤成功。
- `mac/latest-mac.yml`：HTTP 200，内部版本 `2026.9.12000`；arm64 ZIP 105,328,604 字节，x64 ZIP 112,324,226 字节，SHA-512 与清单一致。
- Mac Intel DMG：117,906,078 字节；Apple Silicon DMG：109,493,884 字节。
- Mac Intel DMG SHA-256：`6278a42dd68c6713fc5eedbaab2693a3188c7c46fbe21027e7d33a754a1a1d1e`；Apple Silicon DMG SHA-256：`8778e3178d4f58e0d7caf2da951b2bc6a5d6a9cecb3d04981c2464506360f802`。
- Mac 操作手册：`downloads/QuizMate-客户端使用操作手册.pdf`，HTTP 200，1,839,513 字节；Intel/Apple Silicon 共用这一份手册。
- 官网 `https://www.quizmate.cn/download.html`、`/docs.html` 与 `https://www.quizmate.cn/`（www canonical）已回读；根域无 User-Agent 请求返回 403，www 根域及相关页面均 HTTP 200。
- 回滚备份已确认存在：`rollback/CHG-20260912-01/` 下 9 个旧生产对象。
- GitHub/Gitee：`main` 均为 `469e248`；最终同步标签 `v20260912-3` 指向该提交。生产构建标签 `mac-publish-20260912-prod-1789146662511` 指向构建提交 `0574ad0`，两边均存在且未被改写。

不包含凭据、私钥或签名 URL。Mac 工作流使用已验收的 ad-hoc 双架构包；除非正式 CI 使用 `mac-release-*` 且完成 Developer ID/公证，否则不宣称公证。
