# CHG-20260820-07 自动化验证与部署证据

日期：2026-08-20 +08:00　环境：Windows 11 x64、Node 22、生产 ECS i-2zedgehm045w1gsarawx

## 1. 速度变慢根因分析

- 现象：2026-08-20 08:18 上线 CHG-20260819-04（面试双层回答）后，用户反馈 AI 回答明显变慢。
- 根因：双层提示词要求模型一次生成完整【答题思路】+【详细回答】两段，输出 token 约为原单层回答的 1.5~2.5 倍；面试模式为非流式调用（callChatModel 等待完整 JSON 返回），总耗时与输出长度成正比；同时 max_tokens 900->1600 放宽了输出上限，最坏情况耗时上升约 78%。
- 佐证：除本次提示词与 max_tokens 外，当日无其他后端变更触及面试链路（CHG-20260820-03/04/05 均为 Mac 客户端与官网）；模型配置（voice_model_config，doubao-seed-2.0-mini）与网络路径未变。

## 2. 修复内容

1. DEFAULT_INTERVIEW_PROMPT 替换为用户提供的候选人视角模板（13 条回答原则 + 四类推荐结构 + 输入占位符），长度按复杂度自适应，不再强制双层结构与分隔符。
2. buildInterviewPrompt 新增占位符填充路径：检测到 {question} 即填充 question/position/company/jobDescription/resumeText/language/answerStyle/recentConversation，空字段兜底“（未提供）/（无）”；不含 {question} 的旧格式自定义提示词沿用标签拼接（legacy 兼容）。
3. normalizeInterviewContext 新增 recentConversation 提取（截断 4000 字符）——客户端一直在传该字段，此前被后端丢弃。
4. INTERVIEW_SYSTEM_PROMPT 同步为无双层结构的新风格（第一人称 + 考题类先简述解题思路再展开 + 长度自适应）。
5. 面试模式 max_tokens 1600 -> 1200（输出长度由新提示词控制，上限收紧保证最坏耗时）。

## 3. 本地验证

- 全量单测：`npx vitest run` -> Test Files 20 passed (20)，Tests 86 passed (86)（含新增占位符填充/空字段兜底/旧格式兼容/无双层结构断言）。
- typecheck：通过。生产构建：通过。
- dist 产物标记自检：speech.js 含 {question}+replaceAll+recentConversation；configuration.js 含 候选人第一人称+{context.recentConversation}；model.js 含 1200 且不含【答题思路】。

## 4. 生产部署（2026-08-20 21:00 CST）

- 脚本：`其他/部署工具/deploy-interview-prompt-speed-20260820.cjs`（pctEncode 已含 !/~ 修复，避免 Node fetch URL 重编码导致 ECS 签名失败）。
- 部署 3 个文件：dist speech.js / configuration.js / model.js 至 /opt/quizmate-api-shadow，服务重启 active，/health 正常。
- 服务器端 sha256 与本地一致：speech.js `22891b7c...`、configuration.js `d4d4fd3b...`、model.js `83868377...`。
- 远程 diff 核对：configuration.js 仅 DEFAULT_INTERVIEW_PROMPT 双层模板 -> 用户版模板替换（终端回显为 GBK 乱码，内容以 grep 标记与功能冒烟为准）。
- 部署产物功能冒烟（服务器上直接 import）：
  - REMOTE_PLACEHOLDER_OK=true（问题/岗位/语言/风格/最近对话上下文均正确填充）
  - REMOTE_NO_LEFTOVER=true（无 {question} / {context.*} 残留）
  - REMOTE_NO_TWO_LAYER=true（不再输出【答题思路】/ 分隔符强制要求）
  - REMOTE_SELFINTRO_OK=true（自我介绍强化指令保留）
  - REMOTE_LEGACY_OK=true（旧格式自定义提示词兼容路径正常）
- 回滚备份：`/opt/quizmate-api-shadow.rollback-interview-prompt-speed-20260820-210004/`（含部署前 3 个文件）。

## 5. 待线上观察

- 真实调用耗时回落情况（预期普通问题恢复至昨日水平 ~400-600 token 输出；考题类保留思路先行但总量下降）。
- 新提示词的回答风格是否符合预期（候选人第一人称、贴合简历、考题类先思路后展开）。
- 若管理后台 interview_prompt_config 配置了不含 {question} 的旧自定义提示词，走 legacy 拼接路径（已验证兼容）；若配置了含 {question} 的模板则走占位符路径。
