# CHG-20260828-04 AI 调用链路提速验证

- 时间：2026-08-28（Windows 本地）
- 范围：服务端模型调用与面试上下文裁剪；未修改客户端。
- `npm run typecheck`：通过。
- `npx vitest run tests/model.test.ts tests/interview-action.test.ts`：通过，2 个文件、27 项。
- `npm test`：109/118 通过；9 项失败均为既有 credit-account/credit-log platform/whitelist 测试断言与当前工作区实现不一致，非本次改动触及模块，已保留失败输出。
- 线上真实 AI 延迟：未使用真实账号/令牌调用，待部署后按模型日志中的 `latencyMs`、`inputChars`、`outputChars` 观测。
- 回滚：恢复本次三个变更文件并重新构建服务端，无数据库迁移。

## 部署与测试包

- 源码提交：`768e26f9bed129b518dc70a4281c9c68b1b3a1fc`，发布标签 `v20260828-4`；GitHub/Gitee 均已包含该提交。
- 后端：已部署 `speech.js`、`configuration.js`、`model.js` 到 `/opt/quizmate-api-shadow`，服务 `active`，健康检查为 `status=ok`、`database=ok`、`latencyMs=3`。
- 后端回滚目录：`/opt/quizmate-api-shadow.rollback-interview-prompt-speed-20260828-222919`。
- GitHub 测试构建：Actions `33182088683`，Windows ia32 全流程通过；Release `windows-build-manual-37`。
- 阿里云隔离对象：`temp/CHG-20260828-04/QuizMate-Windows-2026.8.27.2-ai-speed-test.exe`，未覆盖正式 `suite/latest.yml`、官网下载页或正式更新通道。
- 安装包大小：`82,820,154` 字节；SHA-256：`588795caa947f3faa704d5ed2ca689e901eab0f3572ed6f7be852164092cb753`。
- 实体 Windows 截图搜题、面试助手真实账号延迟：待用户安装进行最终验收。
