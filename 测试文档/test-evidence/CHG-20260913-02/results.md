# CHG-20260913-02 测试证据

- 执行日期：2026-09-13（Asia/Shanghai）
- 变更范围：网申助手永久免费文案与自动化定位、工作台当前账号积分明细、面试答案排版及完整问题单次 20 积分扣减。

## 自动化结果

| 检查 | 命令 | 结果 |
|---|---|---|
| Windows Web 类型检查 | `npm run typecheck:web`（`windows客户端/QuizMate-Windows`） | 通过 |
| Windows Node 类型检查 | `npm run typecheck:node`（`windows客户端/QuizMate-Windows`） | 通过 |
| 共享客户端回归 | `npm run test:shared` | 54 个测试文件、414 个测试通过 |
| 后端类型检查 | `npm run typecheck`（`注册登陆模块/阿里云后端-quizmate-api`） | 通过 |
| 后端账户/面试测试 | `npm test -- --run tests/account-actions.test.ts tests/interview-action.test.ts` | 2 个测试文件、15 个测试通过 |
| 差异空白检查 | `git diff --check` | 通过（仅有既存 CRLF 警告） |

## Windows 测试包

- 输出目录：`windows客户端/QuizMate-Windows/release/CHG-20260913-02/`
- 安装包：[QuizMate-Windows-2026.9.10000.exe](../../windows客户端/QuizMate-Windows/release/CHG-20260913-02/QuizMate-Windows-2026.9.10000.exe)
- 架构：Windows ia32（兼容 32 位与 64 位 Windows）
- 文件大小：82,821,651 字节
- SHA-256：`0AEE2064F5870CEA18458F126E83F8343BB262DB748C2EEAE523B8EAB4BC5816`
- 包内校验：`PACKAGED_APP_OK version=2026.9.10000 arch=i386`
- 更新地址：隔离测试地址 `https://quizmate.cn/temp/CHG-20260913-02/suite/`；未发布、未改正式更新清单。

## 覆盖点

- `getCreditLedger` 只按当前会话令牌对应的 `account_id` 查询，忽略客户端传入的其他账号 ID。
- 工作台“积分明细记录”弹框显示当前账号余额、记录数、变动、变动后余额和时间。
- 网申入口及说明仅保留简历识别与网申自动填写，并显示“永久免费”。
- 面试提示词要求结论/理由/总结分段、编号逐行；ASR final 片段先合并，完整问题只创建一次 AI 请求，后端成功结算时扣 20 积分。

## 待实机项

- Windows 客户端登录真实账号后点击工作台“积分明细记录”，确认真实账号流水与余额一致。
- 连续说出被 ASR 拆分的长面试问题，确认只出现一个任务、只扣一次 20 积分且答案分段可读。
