# CHG-20260820-05 测试证据

## 变更前复现

- 官网下载按钮已指向 `2026.8.21`，但 Mac 卡片正文“版本”字段仍为 `2026.8.13`。

## 变更目标

- Mac 卡片正文、DMG 下载链接、更新清单版本均显示/指向 `2026.8.21`。
- 不改动 Windows 卡片、Mac 安装包和客户端更新逻辑。

## 自动化结果

通过。

- `node --check 其他/部署工具/deploy-mac-metadata-20260820.cjs`：通过。
- 本地版本字段与 Apple/Intel 下载链接断言：通过。
- `quizmate.cn`、`www.quizmate.vip` 的 `download.html`：HTTP 200，Mac 卡片正文版本为 `2026.8.21`，不再出现 Mac 卡片 `2026.8.13`。
- 两域名 `mac/latest-mac.yml`：HTTP 200，版本仍为 `2026.8.21`。
- 旧 `rollback/CHG-20260820-04/mac/latest-mac.yml`：两桶均可读取，未被本次元数据发布覆盖。
- 发布脚本：`其他/部署工具/deploy-mac-metadata-20260820.cjs`，输出 `DEPLOY_MAC_METADATA_OK version=2026.8.21`。
