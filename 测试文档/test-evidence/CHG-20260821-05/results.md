# CHG-20260821-05 验证证据：后端模型解析失败自动重试一次（附严格 JSON 指令）

## 1. 背景与诊断

- CHG-20260819-03（2026-08-19）已修复 `doubao-seed-2.0-mini` 返回字符串值内裸控制字符导致的 `INVALID_MODEL_RESULT`（当日 9/79 次 502，11.4%）。
- 部署后效果：
  - 2026-08-20：1/85 次失败（1.2%），17:42:04，Python 题，失败原因为字符串值内**未转义英文引号**（`explanation`/`code` 字段含 `print("...")`），控制字符转义无法修复（引号归属歧义）。
  - 2026-08-21：24 次模型调用，0 失败（首次修复生效）。
- 用户从优化选项中选择：**失败自动重试**（对 `INVALID_MODEL_RESULT` 附严格 JSON 强化指令重试一次）。

## 2. 代码变更

- `src/services/model.ts`：
  - 新增 `STRICT_JSON_RETRY_HINT` 常量（要求只输出一个 JSON 对象；字符串内双引号转义、换行转义 `\n`；不得输出围栏/注释/多余文字）。
  - `runAnalysisModel` 内 `callChatModel` + `parseModelResult` 包 try/catch：捕获 `PublicError` 且 `code === "INVALID_MODEL_RESULT"` 时，在原用户内容末尾附加强化指令后重试一次；其他错误原样抛出。
  - 重试成功只记录一次成功调用统计（与"失败不扣积分"策略一致）。
- `tests/model.test.ts`：新增 3 个用例（AI-PARSE-005/006/007）。

## 3. 自动化结果（全部通过）

| 项目 | 命令 | 结果 |
|---|---|---|
| 模型专项 | `vitest run tests/model.test.ts` | 14/14 通过（11 旧 + 3 新） |
| 全量回归（隔离并行未提交测试后） | `vitest run` | 17 文件 / 77 用例全部通过 |
| typecheck | `tsc --noEmit` | exit=0 |
| 生产构建 | `npm run build` | exit=0 |
| 产物哈希 | `Get-FileHash dist/src/services/model.js -Algorithm SHA256` | `EBAF44804B266AD7E6E21334DCEA0011138A5355860DC1990331DBA378A9A6D6` |

说明：首轮全量 vitest 21 文件 95 用例中 1 项失败（`tests/credit-log-whitelist.test.ts`，并行会话未提交的 admin.ts 改动与旧测试断言冲突，与本次改动无关）。已用 `git stash push -u --include-untracked`（stash：`parallel-session-credit-log-20260822`）隔离后复跑全绿。该 stash 需在并行会话完成后 `git stash pop` 恢复。

## 4. 新增用例明细

- AI-PARSE-005：首答含未转义英文引号（8-20 线上残余失败类型）→ 自动重试一次并成功；重试消息含原题与"严格合法的 JSON"指令；仅记一次成功统计。✅
- AI-PARSE-006：两次均非法 → 只重试一次后抛 `INVALID_MODEL_RESULT`，不记成功统计。✅
- AI-PARSE-007：首答即上游 500 → 直接抛 `MODEL_UPSTREAM_ERROR`，不重试（call=1）。✅

## 5. 附件

- `vitest-full.log`：首轮全量（含并行会话未提交测试的 1 项无关失败）。
- `vitest-credit-isolation.log`：仅隔离验证并行测试文件。
- `vitest-full-after-stash.log`：stash 隔离后全量回归 17/77 全绿。
- `build.log`、`modeljs-hash.txt`、`git-trail.log`、`git-stash.log`：构建、产物哈希、并行改动排查与隔离记录。

## 6. 待办

- 部署 ECS（含 OSS `rollback/` 与 ECS 本地回滚备份）→ `deploy-result.md` 记录部署与线上验证。
