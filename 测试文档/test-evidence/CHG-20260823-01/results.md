# CHG-20260823-01 Mac 启动崩溃修复证据

- 问题根因：`.5` 在 `electron-builder.yml` 中新增 `bundleVersion: 2026.8.22.5`，四段版本被更新器初始化时按 SemVer 解析并抛出 `App version is not a valid semver version`。
- 修复版本：`2026.8.23`，沿用用户已验收的 `2026.8.22.4` `UpdateChecker.ts` 与 electron-updater 路径，移除错误的 bundle 覆盖字段。
- GitHub：`xiaoer4585/quizmate`，提交 `b98fc14`，Actions run `32583935285`。
- 构建结果：Intel 和 Apple Silicon 的类型检查、生产构建、重签名、DMG 校验、架构校验和 OSS 上传均通过；GitHub Release 发布四个资产成功。
- 资产大小：Apple Silicon DMG `126907121`，Intel DMG `130566489`，arm64 ZIP `126884678`，x64 ZIP `128990788` 字节。
- 包内版本：两个架构的主应用 `CFBundleShortVersionString=2026.8.23`、`CFBundleVersion=2026.8.23`；ASAR 中 `package.json` 和 `resources/config.json` 均为 `2026.8.23`。
- 线上：四个 `.23` 下载对象、`mac/latest-mac.yml`、`download.html` 均已发布到 `quizmate-cn`，公网 HTTP 200；更新清单版本为 `2026.8.23`，四个对象均已回读尺寸。
- 回滚：发布前的 `latest-mac.yml` 和 `download.html` 备份在 `quizmate-cn/rollback/CHG-20260823-01/`；本地提前误命名的历史包已移入 `mac客户端/发布包/历史归档`，未删除。
- 未执行：实体 Mac 安装、启动和权限弹窗仍需用户实机最终确认；本次静态包校验已覆盖截图所示 SemVer 崩溃根因。
