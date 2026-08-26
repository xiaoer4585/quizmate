# CHG-20260822-01 Mac 2026.8.24 发布结果

- 构建：GitHub Actions `32499851033`，Intel/Apple Silicon 均成功。
- 本地检查：`npm run typecheck:node`、`npm run typecheck:web`、`npm run build` 通过。
- 产物校验：Intel `x86_64`，Apple Silicon `arm64`；两个 ZIP 均可解压。
- 发布：`quizmate-cn`、`quizmate-vip` 两个 OSS 桶均上传并回读校验成功；发布前对象备份到 `rollback/CHG-20260822-01/`。
- 公网验收：两域名的 `download.html`、`mac/latest-mac.yml`、Intel/Apple Silicon DMG 均 HTTP 200；DMG Content-Length 与本地产物一致。
- 更新清单：版本 `2026.8.24`，arm64/x64 ZIP SHA-512 与大小匹配。
- 实机待验证：macOS 屏幕录制权限、全局截图快捷键、真实 AI 请求和自动更新安装需用户从官网下载后执行。Windows 环境无法代替实体 Mac 验证。
