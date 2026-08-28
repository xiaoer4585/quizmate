# CHG-20260828-08 实现与验证证据

## 实现结果

- 系统截图：未修改 `MacProtection.ts`。QuizMate 自有截图继续在采集事务中隐藏全部悬浮窗；macOS 26 系统截图能看到悬浮窗属于 ScreenCaptureKit 捕获方过滤边界。本次无私有 CGS/SLS、Hook、注入、进程伪装或第三方捕获规避。
- 截图首响应：Mac 截图成功后先把 `screenshot-added` 送给 Renderer，再通过 `setImmediate` 开始压缩；搜题复用相同文件指纹的进行中/已完成 Promise。删除最新、清空队列、清空全部和队列裁剪都会失效缓存。
- 面试首响应：仅 macOS 将重复发送的 JD、简历、最近对话分别限制为 4,000、8,000、2,000 字符，与已部署服务端提交 `768e26f` 对齐；短文本仅 trim，不改正文；超长文本按 72% 头部 + 28% 尾部保留，中间加入明确省略标记且计入上限。最坏高体量字段从约 32,000 降至 14,000 字符，服务端无需再次压缩。
- API 诊断：可选记录请求头等待、响应体读取、JSON 解析、总耗时、请求/响应字节、HTTP 状态和 `Server-Timing`。截图日志额外记录压缩/等待/尺寸/质量；面试日志额外记录并发槽等待、请求准备、问题字符数和上下文总字符数。
- 隐私：诊断不写图片/base64、题目、转写、JD、简历、答案、令牌、完整路径或签名 URL；新增单测验证聚合性能字段保留而正文被剔除。

## 自动化命令与结果

执行环境：Windows 11 x64，2026-08-28 +08:00。实体 macOS 26 结果未由本机推断。

| 范围 | 命令 | 结果 |
|---|---|---|
| Mac Node 类型 | `npm run typecheck:node`（`mac客户端/QuizMate-Mac`） | 通过 |
| Mac Web 类型 | `npm run typecheck:web`（`mac客户端/QuizMate-Mac`） | 通过 |
| Mac 共享测试 | `npm run test:shared` | 通过：2 文件、13 项 |
| Mac 内容保护测试 | `npm run test:mac-protection` | 通过：1 文件、4 项 |
| Mac production build | `npm run build` | 通过：main/preload/renderer 均完成 |
| Windows Node 类型 | `npm run typecheck:node`（`windows客户端/QuizMate-Windows`） | 通过 |
| Windows Web 类型 | `npm run typecheck:web`（`windows客户端/QuizMate-Windows`） | 通过 |
| Windows 共享测试 | `npm run test:shared` | 通过：2 文件、13 项 |
| Windows production build | `npm run build` | 通过：main/preload/renderer 均完成 |
| 差异格式 | `git diff --check` | 通过；仅提示工作区未来 checkout 时 LF/CRLF 规范化，无空白错误 |
| 构建内容 | 在 Mac `out/main/index.js` 搜索关键标记 | 通过：预压缩、上下文限长、面试请求计时、响应体计时均存在 |
| 内容保护边界 | 检查变更文件与新增差异 | 通过：`MacProtection.ts` 未改；无私有捕获 API、无 `setIgnoreMouseEvents(false)` |
| 凭据扫描 | 扫描本次代码、规格与证据的 AKID/LTAI/私钥/Bearer 特征 | 通过：无命中 |
| 代码回滚 | `git diff --binary ... | git apply --reverse --check -` | 通过：当前差异可干净反向应用 |

对齐服务端提交 `768e26f`、升版至 `2026.8.28006` 后，上述 Mac/Windows Node/Web、共享 13 项、MacProtection 4 项和两端 production build 已全部重跑通过。版本门禁确认 package/lock 为 `2026.8.28006`、业务配置为 `2026.8.28.6`。

失败保留：首次版本一致性静态脚本使用 PowerShell `ConvertFrom-Json` 读取含空字符串属性名的 npm lockfile，被 PowerShell 拒绝；产品文件无错误。改用 Node.js 原生 JSON 解析后重跑通过，未修改或弱化 lockfile。

## 无状态网络基线

入口：`POST https://api.quizmate.vip/study-auth-api`，body 仅为不存在的 action `__latency_probe__`，预期 HTTP 400，不带账号、令牌、图片或业务正文，不触发模型和积分。

| 样本 | DNS | TCP | TLS | TTFB/Total | HTTP |
|---|---:|---:|---:|---:|---:|
| 冷 1 | 479 ms | 1,126 ms | 1,211 ms | 1,262 ms | 400 |
| 暖 2 | 12 ms | 53 ms | 120 ms | 165 ms | 400 |
| 暖 3 | 6 ms | 43 ms | 116 ms | 180 ms | 400 |
| 暖 4 | 16 ms | 52 ms | 114 ms | 158 ms | 400 |
| 暖 5 | 10 ms | 57 ms | 116 ms | 164 ms | 400 |

结论：冷网络偶发可增加约 1 秒，但稳定暖入口约 0.16～0.18 秒，不能解释 8～20 秒的完整 AI 等待。客户端登录后的会话验证与资料刷新已经自然预热同一 origin，故未增加新的启动探针。模型推理、视觉输入和重复长上下文仍是主要候选；本次客户端已缩减可控部分并提供分段证据。

## 回滚与未完成项

- `git diff` 可反向应用；本次新增缓存仅在进程内存中，退出即清空；上下文限长只作用于发送副本，不写回用户配置或简历。
- 回滚到 `b181a19442e8568005cbfa38c0abc6624bb8651f` 后无需清理数据库、账号、积分、TCC、安装状态或 OSS 对象。
- 阻塞：实体 Apple Silicon macOS 26 上固定题图和固定面试问题各至少 20 次，统计客户端后处理与端到端 P50/P95；同时抽查长简历/JD答案相关性。
- 交付边界：目标内部版本 `2026.8.28006`、业务版本 `2026.8.28.6`；仅构建 DMG/ZIP 并上传 `quizmate-cn/temp/` 隔离前缀，不更新官网、`latest-mac.yml` 或用户更新通道。
