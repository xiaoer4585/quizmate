# CHG-20260819-02 老用户充值额外赠送50积分 + 套餐名称笔面试化 测试证据

## 一、变更内容

1. 老用户（累计充值过，`total_charged_credits > 0`）充值成功后额外赠送 50 积分，写入独立 `old_user_bonus` 流水。
2. 赠送信息仅对老用户可见：官网充值页老用户专享横幅、支付弹窗赠送明细；Windows 客户端充值弹窗赠送提示。新用户与未登录用户不可见。
3. 积分套餐名称由"笔试体验包/笔试实战包/笔试上岸包"改为"笔面试体验包/笔面试实战包/笔面试上岸包"（无忧包不变）。

## 二、涉及提交

- `beafa4e` feat: 老用户充值额外赠送50积分，官网与客户端仅老用户可见（标签 v20260819）
- `7134a41` feat: 积分套餐名称改为笔面试前缀，并修复后端构建类型错误（标签 v20260819-2）

## 三、自动化验证（本地）

| 检查项 | 命令 | 结果 |
|---|---|---|
| 后端类型检查 | `npx tsc --noEmit`（注册登陆模块/阿里云后端-quizmate-api） | 通过 |
| 后端单元测试 | `npm test` | 20 个文件 83 项测试全部通过（含结算幂等、订单状态机） |
| 后端构建 | `npm run build`（tsconfig.build.json） | 通过（附带修复 model.ts 预存类型错误 `char possibly undefined`） |
| Windows 渲染层类型检查 | `npm run typecheck:web`（windows客户端/QuizMate-Windows） | 通过 |

## 四、部署（阿里云生产）

部署脚本：`其他/部署工具/deploy-old-user-bonus-20260819.cjs`（changeId CHG-20260819-OLD-USER-BONUS）

| 目标 | 对象 | 备份 | 结果 |
|---|---|---|---|
| 官网 OSS quizmate-cn | `recharge.html`（8569 B）、`credits.js`（85583 B） | `rollback/CHG-20260819-OLD-USER-BONUS/` | 上传后 sha256 校验一致 |
| 后端 ECS i-2zedgehm045w1gsar | `/opt/quizmate-api-shadow/dist/src/{domain/credits,actions/accounts,actions/payments,payments/settlement,services/model}.js` | `/opt/quizmate-api-shadow.rollback-old-user-bonus-20260819-225235`（含自动回滚 trap） | 远程 grep 标记校验通过，`quizmate-api-shadow.service` active，`/health` 返回 ok |
| 管理后台 OSS quizmate-vip(cname) | `admin-web/index.html` | `rollback/CHG-20260819-OLD-USER-BONUS/admin-web.index.html` | 上传后 sha256 校验一致 |

部署输出关键行：

```
BACKUP_OK rollback/CHG-20260819-OLD-USER-BONUS/recharge.html 7558 bytes
BACKUP_OK rollback/CHG-20260819-OLD-USER-BONUS/credits.js 77144 bytes
UPLOAD_VERIFY_OK recharge.html 8569 bytes
UPLOAD_VERIFY_OK credits.js 85583 bytes
active
{"status":"ok","database":"ok","version":"0.1.0","time":"2026-08-19T14:52:38.609Z","latencyMs":2}
DEPLOY_OLD_USER_BONUS_OK
ADMIN_WEB_BACKUP_OK / ADMIN_WEB_UPLOAD_OK
ALL_DEPLOY_OK
```

## 五、线上冒烟验证（2026-08-19 22:53 前后）

| 验证点 | 方式 | 结果 |
|---|---|---|
| 官网充值页含老用户横幅 | `GET https://quizmate.cn/recharge.html` | 包含 `data-old-user-bonus` 与新缓存版本号 `20260819-olduserbonus` |
| 官网 credits.js 含赠送逻辑 | `GET https://quizmate.cn/credits.js` | 包含 `oldUserBonus`、`totalChargedCredits` 判断 |
| 后端套餐名称已更新 | `POST /study-auth-api {"action":"getCreditConfig"}` | 返回 `["笔面试体验包","笔面试实战包","笔面试上岸包","无忧包"]`，无旧名称 |
| 后端健康 | ECS `/health` | status ok，database ok |

## 六、回滚方案

- 官网：OSS copy 回 `rollback/CHG-20260819-OLD-USER-BONUS/recharge.html`、`credits.js`。
- 后端：ECS 上 `/opt/quizmate-api-shadow.rollback-old-user-bonus-20260819-225235` 内 5 个文件复制回原路径后 `systemctl restart quizmate-api-shadow.service`（部署脚本已内置 ERR 自动回滚，本次未触发）。
- 数据：赠送积分为增量流水（operation_type=`old_user_bonus`），回滚代码不影响已入账余额；`total_charged_credits` 只累加订单积分不含赠送，回滚后老用户判定不受影响。
- 管理后台：OSS copy 回 `rollback/CHG-20260819-OLD-USER-BONUS/admin-web.index.html`。
- 代码：GitHub 标签 `v20260818-2`（父提交）可整体恢复。

## 七、未执行/已知边界

- 真实支付链路（扫码支付真实扣款到账 50 赠送）需老用户账户实际充值验证，本次通过结算代码路径单测与部署后接口标记校验覆盖；建议首个老用户真实充值后核对 `credit_ledger` 流水。
- Windows 客户端为新版本展示，需随下次客户端发版（当前线上版本不带该 UI）；官网充值页（Mac/安卓/Windows 备用入口）即时生效。
- Mac 实体机、浏览器插件兼容集未涉及共享行为变更，无需执行。
