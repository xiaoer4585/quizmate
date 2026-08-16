# QuizMate 阿里云统一入口

此服务是 `study-auth-api` 的兼容入口：

- 新客户端先获取 OSS 签名上传地址，上传截图后只向阿里云入口提交短 URL。
- 旧客户端仍提交 base64 时，入口会先转存 OSS，保持向后兼容。
- 阿里云入口调用视觉模型（支持 OpenAI / Anthropic / MiniMax 三种 API 格式，可配置）提取截图内容，再把纯文本交给阿里云主 API 中的答题、知识库和积分逻辑。
- 视觉模型拒绝图片或暂时不可用时，服务器自动使用本地中英文 OCR 备用通道，不向客户端直接返回图像识别失败。
- 除图片分析外的动作保持原请求和响应格式，透明转发到 ECS 本机的阿里云主 API。
- OSS 使用 ECS RAM 角色临时凭证，源码、客户端和服务器配置均不保存主账号 AccessKey。
- `screenshots/` 下对象由 OSS 生命周期规则在 1 天后自动删除。

生产入口：`https://api.quizmate.vip/study-auth-api`

CloudBase 历史源码和资源只保留作人工回退，不参与生产请求链路。
