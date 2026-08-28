# CHG-20260828-06 修改前基线

- 记录时间：2026-08-28 +08:00
- 工作分支：`codex/mac-capture-interview-20260828`
- 基线提交：`034c721a75383b3c87a1b81c1bae8a513431d08a`
- Gitee 远端基线：`034c721a75383b3c87a1b81c1bae8a513431d08a`
- Mac 内部版本：`2026.8.28002`
- Mac 业务版本：`2026.8.28.2`
- 目标版本：内部 `2026.8.28003`，业务 `2026.8.28.3`
- 数据/状态迁移：无
- 生产影响：无；本次不修改官网、OSS 正式对象、更新清单或用户更新通道

## 关键文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/helpers/MacProtection.ts` | `4D583FA6517BFF6722B24B2B0B0D205DF13C110F3BE8EB00E2A61BF4B04B5952` |
| `desktop-core/electron/main.ts` | `890B598A465BBA5947A5628E8A1DA65C66A12EBCB8C28524DCBDAA1D8AD2D1C2` |
| `mac客户端/QuizMate-Mac/package.json` | `5BC0BA5BF77D3DF824CA78C0D8A37B3BD6E649C75BD98C88DB8222A00F95CC39` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `88F7100866971049E6732F2DD2E3E0F61805BD04A78CC36D496B6865A626C7A6` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `4BC045C8931DF748F1AA5000F5B1181C118BEAC9B184485FB240BA5A392E585B` |
| `.github/workflows/mac-client-build.yml` | `EE225499709F0C754F3A3A91F245692F4470494524B8CCE52014061F71CA72DC` |

## 回滚验证边界

1. 代码回滚至基线提交后，`MacProtection` 不再包含本次全工作区和置顶恢复补强。
2. 版本文件回到内部 `2026.8.28002`、业务 `2026.8.28.2`。
3. 无数据库、账号、积分或 TCC 标记迁移需要回滚。
4. GitHub 测试 prerelease/标签可单独删除；Gitee 代码历史使用 revert 保留审计。
