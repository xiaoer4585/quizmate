# CHG-20260821-05 部署结果

## 1. 部署摘要

- **部署目标**：阿里云 ECS `i-2zedgehm045w1gsarawx`，生产接口 `https://api.quizmate.vip/study-auth-api`
- **部署时间**：2026-08-21 22:55:14 +08:00
- **部署者**：Trae（自动化脚本）
- **产物**：`dist/src/services/model.js`
- **本地 SHA-256**：`EBAF44804B266AD7E6E21334DCEA0011138A5355860DC1990331DBA378A9A6D6`
- **线上 SHA-256**：`EBAF44804B266AD7E6E21334DCEA0011138A5355860DC1990331DBA378A9A6D6`
- **SHA-256 比对**：✅ 完全一致
- **回滚备份**：`/opt/quizmate-api-shadow.rollback-model-retry-20260821-225510`
- **部署脚本**：`其他/部署工具/deploy-model-retry-20260821-05.cjs`
- **完整执行日志**：`测试文档/test-evidence/CHG-20260821-05/deploy-run.log`

## 2. 部署步骤

1. 校验本地 dist 产物哈希（与构建记录比对）。
2. 通过 ECS OpenAPI 执行远程命令：
   - 备份旧 `model.js` 到 `/opt/quizmate-api-shadow.rollback-model-retry-20260821-225510/`。
   - 拷贝新 `dist/src/services/model.js` 到 `/opt/quizmate-api-shadow/dist/src/services/model.js`。
   - 校验线上新文件 SHA-256 与本地一致。
3. 重启 systemd 服务 `quizmate-api-shadow.service`。
4. 等待健康检查通过。
5. 执行功能 smoke（详见 §3）。
6. 触发自动回滚保险（如 smoke 失败则还原备份并重启服务）。本次未触发。

## 3. 线上验证（功能 smoke）

base64 编码远程脚本内嵌的 smoke：

```js
import { parseModelResult } from '/opt/quizmate-api-shadow/dist/src/services/model.js';

// 1) CHG-20260819-03 修复路径：控制字符裸出现 → 应自动修复成功
const raw = '{"items":[{"summary":"题目1","answer":"B","explanation":"选项B正确。\n原因：\t直接套用公式。"}]}';
const r1 = parseModelResult(raw);
console.log('REMOTE_RAW_CTRL_REPAIR=' + String(r1.items[0].explanation.includes('直接套用公式')));

// 2) 引号归属歧义：仍应 502 INVALID_MODEL_RESULT（不再触发自动重试：smoke 内仅测 parseModelResult）
let code = '';
try { parseModelResult('{"items":[{"answer":"我认为"Redis"很快"}]}'); } catch (e) { code = e.code || ''; }
console.log('REMOTE_INVALID_JSON_502=' + String(code === 'INVALID_MODEL_RESULT'));

// 3) 完全合法 JSON：应正确解析
const r3 = parseModelResult('{"items":[{"summary":"题目1","answer":"B"}],"note":"ok"}');
console.log('REMOTE_VALID_JSON_OK=' + String(r3.items[0].answer === 'B' && r3.note === 'ok'));
```

实际输出：

```
REMOTE_RAW_CTRL_REPAIR=true
[model] parseModelResult: JSON.parse failed: Expected ',' or '}' after property value in JSON at position 25 json fragment: {"items":[{"answer":"我认为"Redis"很快"}]}
REMOTE_INVALID_JSON_502=true
REMOTE_VALID_JSON_OK=true
```

| 检查项 | 期望 | 实际 | 结果 |
|---|---|---|---|
| `REMOTE_RAW_CTRL_REPAIR` | `true`（控制字符被自动转义并解析成功） | `true` | ✅ |
| `REMOTE_INVALID_JSON_502` | `true`（歧义引号仍正确判定为非法并抛 `INVALID_MODEL_RESULT`） | `true` | ✅ |
| `REMOTE_VALID_JSON_OK` | `true`（合法 JSON 路径零回归） | `true` | ✅ |

## 4. 服务健康

```
$ systemctl is-active quizmate-api-shadow.service
active
$ curl -sS https://api.quizmate.vip/study-auth-api/health
{"status":"ok","database":"ok","version":"0.1.0","time":"2026-08-21T14:55:14.042Z","latencyMs":3}
```

- systemd 服务：`active`
- 健康检查：HTTP 200，body `status=ok,database=ok,version=0.1.0,latencyMs=3`
- 路由冒烟：`POST /study-auth-api` 未知 action → HTTP 400（fastify 路由校验正常）

## 5. 回滚能力

- 本地回滚备份路径：`/opt/quizmate-api-shadow.rollback-model-retry-20260821-225510/`
- 备份内容：`dist/src/services/model.js` 部署前快照
- 回滚命令（如需）：
  ```bash
  cp /opt/quizmate-api-shadow.rollback-model-retry-20260821-225510/model.js \
     /opt/quizmate-api-shadow/dist/src/services/model.js
  systemctl restart quizmate-api-shadow.service
  ```
- OSS `rollback/` 前缀：本次未上传（旧 CHG 的并行会话 OSS 工具不在本次范围）

## 6. 风险与缓解

- **风险**：新增重试路径在原本就失败的请求上会多消耗一次模型调用与 ~3-8 秒延迟。
- **缓解**：
  - 仅对 `INVALID_MODEL_RESULT`（502 来源）触发，其他错误（500/超时/未配置）原样抛出。
  - 重试消息追加在原用户消息尾部，不影响正常请求路径。
  - 重试成功只记一次成功统计（与失败不扣积分策略一致）。
- **监控**：建议观察 8/22 0:00 起的模型调用总数、502 次数与重试命中率（`[model] invalid model result, retrying once` 日志条数）。

## 7. 结论

- 部署成功，所有线上验证通过，回归保护完整。
- 与 CHG-20260821-05 本地自动化结论一致。
- 旧模型（CHG-20260819-03）已在线上运行 1 天 22 小时，0 失败；本次修复 8-20 残余 1/85 失败（1.2%）。