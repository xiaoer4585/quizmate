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

- GitHub Actions macOS 14 Intel/Apple Silicon 类型检查、构建、DMG/ZIP、架构与临时签名验证。
- 两架构产物包内版本、更新源、自动安装禁用逻辑复核。
- OSS 发布前备份、双桶上传回读哈希、官网链接和更新清单公网验证。
- 实体 Mac 启动、覆盖安装、权限恢复与 Gatekeeper：阻塞，需 Intel/Apple Silicon 实机补测。
- Developer ID 正式签名、公证、stapling：阻塞，当前未提供 Apple 开发者证书。

## 回滚

- 代码回滚点：`f4819e3`。
- 生产回滚对象：发布脚本上传前复制至 `rollback/CHG-20260820-03/`。
- 无数据库、账号、积分或本地数据迁移。
