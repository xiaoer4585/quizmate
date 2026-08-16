# 邀请注册机制

本目录保存邀请注册、积分奖励、代理佣金和风控设计资料。

生产实现仍位于 `注册登陆模块/阿里云后端-quizmate-api`：

- `src/actions/referrals.ts`：邀请关系和用户动作。
- `src/actions/analysis.ts`：首次成功使用后的邀请奖励激活。
- `migrations/007_referral_system.sql`：数据库结构。

保持运行代码在后端产品域内，可以避免跨目录导入和部署遗漏。
