# CHG-20260819-03 测试证据：修复面试回答 JSON 含裸换行导致的模型调用失败

## 1. 线上故障诊断（2026-08-19，生产 ECS i-2zedgehm045w1gsarawx）

通过 `journalctl -u quizmate-api-shadow.service` 检索当日日志：

- 总请求数 6418，其中 200 成功 6402、400×2、401×4、402×1、**502×9**。
- 模型调用层：`[model] raw content`（HTTP 成功拿到模型返回）79 次；上游 HTTP 错误 0 次、超时（>50s）0 次、空返回 0 次。
- 9 次 502 全部为 `[model] parseModelResult: JSON.parse failed: Bad control character in string literal in JSON at position 89/106/107/112/119/258...`，全部来自 `generateInterviewAnswer`（实时面试回答，21:54:48～22:17:22）。
- 解析失败率 9/79 ≈ 11.4%。
- 当日 `model_daily_calls`（仅统计成功）：text 14、image 56。

失败样本（22:05:57，req-4pi，responseTime 4052ms，日志脱敏摘录）：

```text
[model] raw content (first 300 chars): {"items":[{"summary":"面试官询问Redis所有数据结构、底层实现及各自好处","answer":"我先整理一下我对Redis数据结构、底层实现和优势的理解。
1、Redis...
2、...
[model] parseModelResult: JSON.parse failed: Bad control character in string literal in JSON at position 89
```

根因：面试/语音模式使用 voice_model_config（doubao-seed-2.0-mini，ark plan API），该模型在 answer 字符串值内输出**未转义的真实换行**（JSON 规范禁止字符串内出现裸控制字符 U+0000–001F），`JSON.parse` 直接抛错；原 `parseModelResult` 的 JSON.parse 失败分支只对代码类内容降级，`allowInterviewText` 兜底仅覆盖"找不到 JSON 大括号"分支，导致直接向客户端返回 502 `INVALID_MODEL_RESULT`。

## 2. 修复内容

`注册登陆模块/阿里云后端-quizmate-api/src/services/model.ts`：

1. 新增 `escapeRawControlChars(json)`：按 in-string 状态机只对字符串字面量内部的裸控制字符转义（`\n`/`\r`/`\t`/其他 <0x20 转 `\uXXXX`），字符串外合法空白不动，转义对原样保留。
2. `parseModelResult`：首次 `JSON.parse(json)` 失败后，用转义结果重试一次；仍失败时面试模式（`allowInterviewText`）降级为原文回答，其余分支维持原有行为（代码降级 / 抛 `INVALID_MODEL_RESULT`）。

不改动：积分结算（`settleInterviewSuccess` 仅在解析成功后执行）、鉴权、提示词、数据库。

## 3. 自动化结果（本地 Windows 11 x64，Node/Vitest 4.1.10）

命令（在 `注册登陆模块/阿里云后端-quizmate-api` 下执行）：

```powershell
node_modules\.bin\vitest.cmd run                    # 全量
node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit # typecheck
node_modules\.bin\tsc.cmd -p tsconfig.build.json    # 生产构建
```

结果：

- 模型专项 `tests/model.test.ts`：11 项通过（原 7 项 + 新增 4 项 AI-PARSE 用例）。
  - AI-PARSE-001：复现线上失败样本（answer 内裸换行）→ 修复后成功解析，答案保留分段换行。
  - AI-PARSE-002：面试模式不可修复 JSON（字符串内未转义英文引号）→ 降级为原文回答，不再 502。
  - AI-PARSE-003（原有用例回归）：非面试非法 JSON 仍抛 `INVALID_MODEL_RESULT`。
  - AI-PARSE-004：合法 JSON（含字符串外换行缩进）原样解析，不受容错影响。
- 全量 vitest：20 个测试文件、83 项全部通过。
- typecheck：exit 0。
- 生产构建 `tsc -p tsconfig.build.json`：exit 0。
- 首次 typecheck 曾报 `char is possibly 'undefined'`（noUncheckedIndexedAccess），改用 `String.charAt` 后复测通过。

## 4. 部署与线上验证

见本目录 `deploy-result.md`（部署后补充）。

## 5. 回滚点

- 代码：本次 Git 提交的父提交。
- 生产：部署脚本在 ECS 上备份 `/opt/quizmate-api-shadow` → `/opt/quizmate-api-shadow.rollback-chg20260819-03-<TS>`，并 pg_dump 数据库到 `/tmp/quizmate-deploy/chg20260819-03/`。
- 无数据库迁移；历史上失败调用不扣积分，成功调用无新增需回滚数据。
