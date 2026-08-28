# CHG-20260828-05 变更前基线

- 时间：2026-08-28 +08:00
- 分支：`codex/mac-capture-interview-20260828`
- 提交：`2418a6ac89039a6a3125d30c5e39395d6a2b36d2`
- 工作区：变更前干净
- Mac 内部版本：`2026.8.28001`
- Mac 业务版本：`2026.8.28.1`
- bundle ID：`vip.quizmate.mac`
- 当前构建身份：CI 禁用证书自动发现，并以 `codesign --sign -` 做 ad-hoc 重签；`hardenedRuntime=false`，正式 Developer ID/公证未配置。
- 数据迁移边界：只增加本地、一次性、按 bundle ID 限定的 TCC 修复标记；不修改后端、数据库、积分、账号或生产更新清单。

## 关键文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/helpers/PermissionOnboardingHelper.ts` | `B1E8EFC4096338DE861342ED34F9A24D185AC4380D464A91B57830D663EF3FB8` |
| `desktop-core/src/components/PermissionOnboarding.tsx` | `D02218EEAC8C8E220CC50D0C42CDE7DC18969457EF87695FDE5378B73215A010` |
| `desktop-core/electron/ipcHandlers.ts` | `E6F3DA864DECF45B88F50B9C4681023FE9B463C4C6C4FE73F0248685A848DC5E` |
| `desktop-core/electron/preload.ts` | `F8095A7E696491F8B0A16929B6BB696CDADFF0D46D090C1F477FBD1CB53ADD57` |
| `desktop-core/electron/main.ts` | `426966FCA689BE1E85A55C8A7DD34969D9353BB4AF8EAF11C2BC165CF5CFCA25` |
| `desktop-core/electron/OverlayManager.ts` | `465065806C3418941B90E227A2461316261BE7EF5D61005A057B1DF0CE226834` |
| `desktop-core/electron/helpers/MacProtection.ts` | `6444337C7926F046E076F402488DA3DC0B17C98FB24F6B290996DA53017CC1F9` |
| `mac客户端/QuizMate-Mac/electron-builder.yml` | `AC7B561A76EBFFBDA3AB5EE526CDF0FD3EAA05671AD8C5E98D78C1C3F3916BB7` |
| `.github/workflows/mac-client-build.yml` | `37B1A3BFF68D78D78306C54128777763FF462361A04CA827F42C1DC28CC5DFB3` |

## 回滚

代码回滚到上述提交。新本地迁移标记由旧客户端忽略；已由用户重新授予的 macOS 权限不在回滚时自动清除。正式下载对象、官网和更新清单不在本变更范围。
