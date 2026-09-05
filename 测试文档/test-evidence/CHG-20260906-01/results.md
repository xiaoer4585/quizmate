# CHG-20260906-01 测试证据

## 变更前基线

- 基线提交：`341dad3`。
- Mac 生产更新清单保持 `https://quizmate.cn/mac/latest-mac.yml`，本次不修改。
- 本地存在另一会话带来的 Windows/共享改动，范围与本需求一致：连续截图合并、多图搜题、长语音片段合并、面试请求重试与账户隔离。

## 已执行自动化

- Mac：`npm run typecheck:node`、`npm run typecheck:web`、`npm run test:shared`（6 文件/47 项）、`npm run test:mac-protection`（4/4）、`npm run build`，均通过。
- Windows：`npm run typecheck:node`、`npm run typecheck:web`、`npm run test:shared`（6 文件/47 项）、`npm run build`，均通过。
- 静态覆盖：Mac 权限引导去除“暂不授权”入口；Exam 开始使用前调用 `permissions.authorizeAll()`；权限状态在笔试页显著区域展示；截图队列最多 3 张并合并后一次分析；面试长语音片段合并和请求重试逻辑纳入共享构建。

## 待实体设备验收

- Mac Intel/Apple Silicon：新包首次启动授权、屏幕录制 TCC、辅助功能、点击笔试“开始使用”二次检查、真实截图、面试悬浮框多图搜题、长语音连续问题。
- 权限失败时必须显示错误码/系统设置入口，不能以 Windows 或 CI 结果替代。

## 双架构测试包

- GitHub Actions：`33982475659`，Intel/Apple Silicon 均成功，提交 `77745e785c4f4398c4153e7dcce0f39ac4117395`。
- Intel DMG：`7245dc9e3addf521cd46387f90b2d34e70214af669f3ac0c69b659ec2b66a6ec`。
- Intel ZIP：`7322b4aa656b55a852b42edd88624386f498eb797f3d2b399c7c92e0bda558e2`。
- Apple Silicon DMG：`cc49534e30394ea187e4823202228b1885effa1a55b37548c7ccb42aec6e30dc`。
- Apple Silicon ZIP：`22167538ea33ca839b8933013d754376fe4cad52d7a09db8a1dee002cdf6d605`。
- 四个对象均已完成 HTTP 200 HEAD 与 HTTP 206 Range `bytes=0-1023` 校验；生产 Mac 更新清单未改。

## 2026-09-06 快捷键追加修复

- 根因：macOS Option+字母在 `KeyboardEvent.key` 中会变成 `œ`、`´`、`®` 等组合字符，旧配置被持久化后默认快捷键无法注册；注册链路也只尝试单一 Electron accelerator 拼写。
- 修复：迁移已保存的组合字符到物理字母；Mac 注册和恢复时兼容 `Alt/Option` 及大小写 key 拼写；UI 始终显示 `option+q`、`option+e`、`option+r` 等小写文本。
- 新测试包版本：`2026.09.06.2`，需重新安装并在系统设置中确认当前 QuizMate 权限。
- 本次 GitHub Actions `33984932527` 双架构成功。Intel DMG/ZIP SHA-256：`ed252f53740ac3eb107628b20fd887bd243f82503519ff00442dedbf47d87e17` / `c8c7aed193807b947848a2b817a0aada5b22ad4ea325503e08e9564fc60e0c74`；Apple Silicon DMG/ZIP：`8795879726dff085ef841834225a442843689ea71c5cf97956b2af919a52e14d` / `cabf4f7652496e49cbc69eb1a6b93747e42781c006357be51d5c0a7e3db23379`。四个对象 HTTP 200/Range 206 校验通过。

## 回滚

- 回滚到 `341dad3`，删除本轮临时测试包对象；不触碰官网和正式 Mac 更新映射。
