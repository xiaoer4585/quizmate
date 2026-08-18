# CHG-20260818-04 测试结果

## 自动化验证

- 后端 `npm run typecheck`：通过。
- 后端 `npm run build`：通过。
- 后端 `npm test`：通过，20 个测试文件、79 项测试全部通过。
- 后端面试专项：同一问题连续两次调用模型 2 次，分别扣 20 积分；回答格式化为结论段和 `1、2、3` 独立段落，专项测试通过。
- Windows `npm run typecheck:node`、`npm run typecheck:web`：通过。
- Mac `npm run typecheck:node`、`npm run typecheck:web`：通过。
- Windows `npm run package:win`：通过。
- Windows `npm run verify:win-package`：通过，`PACKAGED_APP_OK version=2026.8.18 asar=46718519`。
- 正式安装包：`windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.8.18.exe`，87,925,955 字节，SHA-256 `E6BA8D0DD0D7F74B914B1790C30694EF48BA7784283AFBDC2B1D92DB72B43F5B`。
- 更新清单：`release/latest.yml` 版本、文件名和 size 与正式安装包一致。
- 包内静态检查：重磅更新通知、20 积分文案、按钮级操作指引、重复问题独立队列、上下题快捷键均已打包。

## 生产发布

- 后端部署：通过。ECS 服务 `quizmate-api-shadow.service` active，内网 health 返回 `status=ok`、`database=ok`；备份目录 `/opt/quizmate-api-shadow.rollback-interview-pricing-20260819-000724`。
- 后端默认面试提示词：通过后台 action 写入，备份长度 443，发布后长度 674。
- Windows OSS 更新通道：通过。`https://update.quizmate.vip/suite/latest.yml` 返回 200，版本 `2026.8.18`，安装包 size `87925955`；相对安装包 URL HEAD 返回 200。
- 官网 Windows 下载：通过。`https://quizmate.cn/downloads/QuizMate-Windows-2026.8.18.exe` 和 `https://www.quizmate.vip/downloads/QuizMate-Windows-2026.8.18.exe` 均返回 200、87,925,955 字节；两个官网的 `download.html` 均返回 200。
- Mac 线上发布边界：保持未发布，未更新 `downloads/mac/*` 或 `latest-mac.yml`。

## 未完成/阻塞

- Mac Intel/Apple Silicon 云构建：等待 GitHub Actions 推送后执行；本机未进行 macOS 签名、公证或实体 Mac 安装验证，不能标记通过。
- Windows 实机覆盖安装、快捷键、麦克风/系统音频和登录后真实 AI 请求：需用户实机验收。
- 临时目录 `E:\ai项目\考试插件\测试安装包`：删除操作被当前工作区文件系统 ACL 拒绝，未能确认删除；正式包未受影响，仍位于 Windows `release` 目录。
