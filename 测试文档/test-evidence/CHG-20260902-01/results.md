# CHG-20260902-01 测试证据

执行时间：2026-09-02（Asia/Shanghai）

## 本地验证

- 后端 `npm run typecheck`：通过。
- 相关回归 `npx vitest run tests/activities.test.ts tests/action-registry.test.ts tests/admin-credit-platform.test.ts tests/model.test.ts`：23/23 通过。
- 后端 `npm run build`：通过。
- 后台内联脚本语法检查：通过（`ADMIN_INLINE_SYNTAX_OK`）。
- 全量 Vitest：136/138 通过；`credit-account-platform.test.ts` 2 项为工作区既有 SQL 断言不匹配，与本次 action 注册修复无关，保留失败证据，不修改测试规避。

## 发布验证

待执行：ECS 服务健康、两个 action 未授权 smoke、后台 OSS 回读哈希及回滚备份。完成后追加命令输出、提交/tag 和线上 URL 验证结果。
