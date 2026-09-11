# CHG-20260911-01 变更前基线

- 记录时间：2026-09-11（Asia/Shanghai）
- 隔离分支：`codex/mac-companion-test-20260911`
- 源码基线：`44a537b4ccd394d6567a055d93b976b6b9fbef3c`（本地 `github/main`）
- Mac 版本：内部 `2026.9.6000`，公开 `2026.09.06`
- 数据/服务迁移边界：无数据库迁移，不修改 relay、账号、积分后端或生产配置。
- 功能开关/发布边界：Mac 双机入口和主进程初始化在基线中关闭；仅允许 `mac-delivery-*` 测试构建，不更新官网、`mac/latest-mac.yml`、生产清单或正式 OSS 对象。

## 变更前文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/main.ts` | `496A77727008034CE81BDFA0564F23185D57E2EC63AE58F878F45427C46E2BC8` |
| `desktop-core/src/components/MainLayout.tsx` | `C4CA0650D2735812507A1887ACD3D4B7EAEBA2B7EB4B95E27FDA65417D63C2E3` |
| `desktop-core/src/pages/Dashboard.tsx` | `A5C16F63727D62D0FCD1A59C14FF0E9E110AC746E80F167B59A87F3EF5ECEAB2` |
| `desktop-core/shared/__tests__/desktop-entrypoints.test.ts` | `1A8A90FC3A6C852B6D63B82E090941C7B3291E4E383CDE42505BBAA05ED20D39` |
| `desktop-core/shared/__tests__/workspace-routing.test.ts` | `4340859E571F22D33961BD36599258CBBC584F21AFD0BB73D48213F0C6EDEF48` |
| `mac客户端/QuizMate-Mac/package.json` | `8D1474EE369A348FA0D7736330C91970225E0A3B92A9F8D315B81D4E7EB015D5` |
| `mac客户端/QuizMate-Mac/package-lock.json` | `4E5F426F2B443548708B36557447232C53948BF771FBDACA8D05281A5F3B8CEF` |
| `mac客户端/QuizMate-Mac/resources/config.json` | `C8519F2189DC8F7537ED2B202BC50B3369EC88399B0E30E8A89D1FBEEB058C3F` |
| `mac客户端/QuizMate-Mac/tsconfig.node.json` | `B84E433A21A7713CC281AD1040FE648C61626A9DB16E099878BF05FFF7D02D40` |
| `.github/workflows/mac-client-build.yml` | `D7CEE0BB9B738ECE1EF20F6C3710C0FB661E24FF8F61661FBB8AE1A2DB90FD34` |

> 本记录不包含任何凭据、令牌或签名 URL。

## 回滚验证计划

1. 代码回滚到上述基线后，确认 Mac 不显示双机入口，旧 `2026.09.06` 包仍可启动。
2. 新增逻辑不写入数据库；应用回滚后 relay 临时会话按主动撤销或租约过期清理。
3. 退出账号和切回 PC 工作区均需清空双机本地会话、截图队列与听写状态。
4. 测试包以独立更新 URL 构建，不得覆盖生产清单，因此无需生产状态回滚。
