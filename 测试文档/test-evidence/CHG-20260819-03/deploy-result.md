# CHG-20260819-03 部署与线上验证结果

## 部署方式与时间线

- 本次修复编译产物 `dist/src/services/model.js`（含 `escapeRawControlChars` 与解析重试逻辑）于 2026-08-19 22:49 本地构建。
- 2026-08-19 22:52:35 CST，同日另一并行发布（老用户充值赠送，`rollback-old-user-bonus`）按同一 dist 打包部署到生产 ECS `i-2zedgehm045w1gsarawx`，本修复随之一起上线。
- 部署后核验：`systemctl restart quizmate-api-shadow.service` 成功，服务 active，`/health` 返回 `{"status":"ok","database":"ok"}`。

## 一致性校验

- 线上 `/opt/quizmate-api-shadow/dist/src/services/model.js` SHA-256：`827fd0a02acab61b954cb65992deb55d27200544965af921c6b01b81c14d3a91`
- 本地 `注册登陆模块/阿里云后端-quizmate-api/dist/src/services/model.js` SHA-256：`827fd0a02acab61b954cb65992deb55d27200544965af921c6b01b81c14d3a91`
- 两者完全一致；线上文件含 `escapeRawControlChars` 标记 2 处。

## 线上功能验证（在生产服务器上直接 import 部署代码执行）

| 用例 | 输入 | 结果 |
|---|---|---|
| CASE1 | 2026-08-19 22:05:57 线上真实失败样本（Redis 面试题，answer 内含裸换行），面试模式 | PASS：成功解析，答案含“1、Redis基于内存”且保留换行分段（91 字符） |
| CASE2 | 同一样本，笔试模式 | PASS：成功解析 |
| CASE3 | 不可修复非法 JSON（字符串内未转义英文引号），笔试模式 | PASS：仍抛 `INVALID_MODEL_RESULT`（原失败行为保留，失败不扣积分） |
| CASE4 | 同 CASE3 输入，面试模式 | PASS：降级为原文回答，不再 502 |

## 部署后日志观察（22:52 重启起）

- `JSON.parse failed`：0 次
- `statusCode:502`：0 次

## 回滚点与回滚步骤

- 回滚备份目录：`/opt/quizmate-api-shadow.rollback-old-user-bonus-20260819-225235/`（含部署前 model.js，SHA-256 `ca74ffd77523caf79353e54660d8383d11bb087875101cabf271014c1a99d490`，即当日发生 9 次失败时的版本，另有 accounts.js / credits.js / payments.js / settlement.js）。
- 本变更无数据库迁移、无配置变更，失败调用历史上不扣积分，成功调用无新增数据需回滚。
- 回滚命令：`cp -a /opt/quizmate-api-shadow.rollback-old-user-bonus-20260819-225235/model.js /opt/quizmate-api-shadow/dist/src/services/model.js && systemctl restart quizmate-api-shadow.service`，随后执行 P0 冒烟（health、登录接口、模型调用解析）。

## 版本

- 代码提交：`ca623a1`（fix: 容错解析模型返回JSON字符串内的裸控制字符），合并 main，tag `v20260819-3`，已推送 GitHub。
- 说明：model.ts 源文件改动因并行会话提交 `7134a41` 已先入库（同一工作区），`ca623a1` 包含测试与文档；两提交均已在 main。
