# CHG-20260912-01 发布证据

- 发布分支：`codex/resume-extension-main-20260910`（正式 main 工作树）
- Mac 发布提交：合并提交待创建；来源提交 `c0a6fac29cb660bcefb7335ebef3019fc3de5765`
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

不包含凭据、私钥或签名 URL。Mac 工作流使用已验收的 ad-hoc 双架构包；除非正式 CI 使用 `mac-release-*` 且完成 Developer ID/公证，否则不宣称公证。
