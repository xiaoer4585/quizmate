# CHG-20260813-01 当前结果

- 网关：`npm.cmd test`，17/17 通过。覆盖上传票据、OSS 内网读取、Base64 视觉请求、鉴权和错误边界。
- 主 API：受影响测试 9/9 通过；`npm.cmd run typecheck` 和 `npm.cmd run build` 通过。
- 客户端：Windows `typecheck:node`、`typecheck:web`、`build` 通过；macOS `typecheck:node`、`typecheck:web`、`build` 通过；快捷键源码迁移检查 `SHORTCUT_MIGRATION_OK`。
- 秋招助手/实时语音：Windows/macOS `RealtimeVoiceHelper` 类型检查通过；启动前校验 `wss:`、API Key、Resource-Id，鉴权头仅注入后台配置的 ASR 主机；面试助手继续复用后台提示词、岗位、公司和简历上下文。
- Windows 打包：失败，electron-builder 在 `release` 和 `release-20260813` 解包时遇到 `Access is denied`，当前机器仍有多个 QuizMate 进程运行；未覆盖旧产物。
- macOS 打包：失败，当前 Windows 环境不支持 macOS DMG 构建；前端 `out` 已成功生成。
- 线上部署：未执行。现有部署脚本只覆盖主 API，未覆盖本次变更的视觉网关，避免产生不一致版本。
- GitHub：待提交推送。
