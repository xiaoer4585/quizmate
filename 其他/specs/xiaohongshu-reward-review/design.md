# 小红书分享审核原型设计

## 模块

- `xiaohongshu-reward.js`：用户登录门槛、文案复制、凭证预览、本地提交和审核记录。
- `styles.css`：用户侧素材、上传区和记录样式。
- `admin-web/index.html`：新增审核菜单、列表、详情和审核动作。
- `localStorage.quizmate_xhs_reward_reviews_v1`：用户端和后台共用的演示记录。

## 状态模型

记录包含 `id`、`accountEmail`、`noteUrl`、`normalizedUrl`、`likeCount`、`favoriteCount`、`tier`、`rewardCredits`、`proofDataUrl`、`status`、`rejectReason`、`submittedAt`、`reviewedAt`。

状态为 `pending`、`approved`、`rejected`。后台通过前检查同一规范化链接是否存在其他 `approved` 记录，并显示风险提示，但不强制禁止审核。

## 正式上线要求

正式实现必须由服务端读取当前账户身份、计算档位与积分、保存文件、规范化链接、事务性幂等发放积分，并记录管理员与审计日志。前端字段均不得作为可信发放依据。
