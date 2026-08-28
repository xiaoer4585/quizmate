# CHG-20260828-04 AI 调用链路提速验证

- 时间：2026-08-28（Windows 本地）
- 范围：服务端模型调用与面试上下文裁剪；未修改客户端。
- `npm run typecheck`：通过。
- `npx vitest run tests/model.test.ts tests/interview-action.test.ts`：通过，2 个文件、27 项。
- `npm test`：109/118 通过；9 项失败均为既有 credit-account/credit-log platform/whitelist 测试断言与当前工作区实现不一致，非本次改动触及模块，已保留失败输出。
- 线上真实 AI 延迟：未使用真实账号/令牌调用，待部署后按模型日志中的 `latencyMs`、`inputChars`、`outputChars` 观测。
- 回滚：恢复本次三个变更文件并重新构建服务端，无数据库迁移。
