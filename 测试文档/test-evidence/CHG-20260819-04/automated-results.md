# CHG-20260819-04 自动化验证证据

日期：2026-08-19 +08:00　环境：Windows 11 x64、Node 22、Trae 沙箱终端

## 1. 阿里云主 API（注册登陆模块/阿里云后端-quizmate-api）

### 1.1 面试专项测试
命令：`npx vitest run tests/interview-action.test.ts`
结果：Test Files 1 passed (1)，Tests 11 passed (11)，Duration 1.37s
说明：含新增 2 项用例（IV-PROMPT-001 双层结构+分隔符+岗位专家、分隔符排版保护），既有 9 项全部通过。

### 1.2 全量单测
命令：`npx vitest run`
结果：Test Files 20 passed (20)，Tests 85 passed (85)，Duration 5.26s
说明：首次运行时 tests/model.test.ts:128 断言旧 max_tokens=900 失败（预期内，随本次改动更新为 1600 并补充双层提示词断言），更新后复跑全部通过。

### 1.3 类型检查
命令：`npm run typecheck`
结果：通过（tsc -p tsconfig.json --noEmit，无错误输出）。

### 1.4 生产构建
命令：`npm run build`
结果：通过（tsc -p tsconfig.build.json，退出码 0）。

## 2. Windows 客户端（windows客户端/QuizMate-Windows）

### 2.1 类型检查
命令：`npm run typecheck:node`、`npm run typecheck:web`
结果：均通过。首次运行 web 检查报 lucide 图标类型不兼容（TS2322），改用 LucideIcon 类型后通过。

### 2.2 生产构建
命令：`npm run build`
结果：通过（main 165.78 kB / preload 10.16 kB / renderer index-DOCW12KE.js 632.92 kB，vite built in 40.44s）。

### 2.3 运行时冒烟（DT-032/DT-033 自动化部分）
命令：`npm run dev`（Electron 22.x 二进制经 npmmirror 安装至项目内 .electron-cache）
结果：阻塞。主进程/preload 构建成功且 Electron 成功拉起，但 Trae 沙箱拒绝 Electron 读取 `C:\Windows\system32\spool\drivers\color\sRGB Color Space Profile.icm`，进程被沙箱终止。属测试环境限制，非代码错误。
结论：悬浮窗按钮悬停/点击、托盘菜单点击、穿透复位等交互（DT-032、DT-033）需人工在真实 Windows 桌面实测，状态标记为阻塞。

## 3. 已验证的静态行为要点

- `buildInterviewPrompt` 输出包含：答题思路/详细回答双层说明、10 个半角横线分隔符（0x2d × 10，与 INTERVIEW_SECTION_DIVIDER 一致）、"先输出【答题思路】再输出【详细回答】/先输出【详细回答】"顺序规则、"资深专家"岗位角色强化、`"explanation":""`。
- `formatInterviewAnswer`：分隔线（任意 3+ 横线整行）统一规范为标准分隔符且前后各留一空行，不再被项目符号转换吞噬；【答题思路】/【详细回答】标题后补空行；既有编号分段行为（11 项既有断言）不变。
- `model.ts` interview 模式 max_tokens 900 -> 1600，system prompt 断言含双层结构与顺序规则。
- Windows `main.ts`：setIgnoreMouseEvents 按参数生效（true 时保持 forward:true），move/resize 复位穿透；托盘回调含 interviewActive 守卫与 overlay 模式自动拉起悬浮窗。
- Windows `ExamOverlay.tsx`：头部 3 个按钮（截图/搜题/复制）经 `exam:screenshot`/`exam:search` IPC 与 `handleCopyContent` 触发，悬停经 `overlay:setIgnoreMouseEvents` 临时解除穿透。

## 4. 后端部署（2026-08-20 08:18 CST，生产 ECS i-2zedgehm045w1gsarawx）

部署脚本：`其他/部署工具/deploy-interview-two-layer-20260820.cjs`（仅 3 个文件：dist speech.js / configuration.js / model.js）

### 4.1 部署前构建完整性核验

- 主工作区（含并行会话未提交改动）与 git worktree@358a568（纯已提交源码）两次独立构建，3 个目标 dist 文件 SHA256 逐一比对全部 IDENTICAL，证明产物只含本次已提交改动，未夹带并行开发中的兑换码/充值赠送逻辑。
- 本地 dist 产物功能自检（node 导入 dist speech.js）：LOGIC_PROMPT_OK / NORMAL_PROMPT_OK / FORMAT_OK 全部 true。

### 4.2 部署过程

- 首次执行失败：ECS API `IncompleteSignature`。根因：远程命令含 `!` 字符，Node fetch 的 WHATWG URL 解析将其重编码为 %21，与本地签名串不一致（历史脚本无 `!` 故未触发）。修复：pctEncode 补齐 `!`/`~` 编码并改写命令避开裸 `!`，复跑成功。
- 远程 diff（old -> new）逐文件核对：speech.js 仅新增 INTERVIEW_SECTION_DIVIDER、双层硬性排版要求、双层 JSON 示例、formatInterviewAnswer 分隔符规范与标题空行（另有几行 SQL 模板字符串行尾空白差异，无语义变化）；configuration.js 仅 DEFAULT_INTERVIEW_PROMPT 双层重写；model.js 仅 INTERVIEW_SYSTEM_PROMPT 重写与 max_tokens 900->1600。无其他文件改动。
- 部署后服务器上 sha256 与本地一致：speech.js `347c94fe...`、configuration.js `8b6c74fb...`、model.js `3cefddc4...`。
- 服务器上直接 import 部署产物冒烟：REMOTE_LOGIC_PROMPT_OK=true（系统设计题：双层+分隔符+资深专家+顺序规则）、REMOTE_NORMAL_PROMPT_OK=true（自我介绍：常规问题顺序）、REMOTE_FORMAT_OK=true（分隔线规范化排版）。
- `systemctl is-active quizmate-api-shadow.service` = active；`/health` 返回 `{"status":"ok","database":"ok"}`。
- 部署含 ERR trap 自动回滚（备份恢复 + 服务重启），本次未触发。

### 4.3 回滚点

- 服务器备份目录：`/opt/quizmate-api-shadow.rollback-interview-two-layer-20260820-081855/`（含部署前 speech.js / configuration.js / model.js）。
- 回滚命令：`cp -a <备份>/speech.js /opt/quizmate-api-shadow/dist/src/actions/speech.js; cp -a <备份>/configuration.js /opt/quizmate-api-shadow/dist/src/actions/configuration.js; cp -a <备份>/model.js /opt/quizmate-api-shadow/dist/src/services/model.js; systemctl restart quizmate-api-shadow.service`。

### 4.4 待线上观察

- 真实用户面试回答的双层结构命中率、逻辑题/常规题顺序正确性、detailed 模式回答长度（max_tokens 1600 是否出现截断）、回答耗时变化（输出变长带来的延迟）。
- 若管理后台 interview_prompt_config 存在自定义提示词，需确认未覆盖新默认值。

## 5. Windows 客户端 2026.8.20 发布（2026-08-20 14:05 CST）

发布脚本：`其他/部署工具/deploy-windows-release-20260820.cjs`

### 5.1 打包与产物验证

- 版本号升级：`package.json` 与 `resources/config.json` 2026.8.18 -> 2026.8.20；官网 download.html / index.html / blog/article-exam-skills.html 的 Windows 下载链接同步指向 2026.8.20。
- 命令：`npm run package:win`（electron-vite build + electron-builder nsis x64）。构建后内置校验输出 `PACKAGED_APP_OK version=2026.8.20 asar=46721194`。
- 产物：`release/QuizMate-Windows-2026.8.20.exe`（87,924,738 字节）+ `.blockmap` + `latest.yml`（sha512 pWUnZDCb...）。
- asar 内容抽查：包含托盘菜单"全屏截图"/"搜题"、`setIgnoreMouseEvents` 穿透切换逻辑、`OverlayActionButton` 按钮组件，确认鼠标兜底改动已进入安装包。
- 工作区核验：打包时 windows客户端 目录无未提交源码改动（仅历史 test-release 未跟踪目录），mac-build-fix 分支的 CI workflow 改动不影响 Windows 产物；产物等效 main@358a568 + 版本号。

### 5.2 发布与线上验证

- 上传对象：`suite/latest.yml`、`suite/QuizMate-Windows-2026.8.20.exe`（+blockmap）至 quizmate-vip；`downloads/QuizMate-Windows-2026.8.20.exe` 至 quizmate-vip 与 quizmate-cn；download.html / index.html / blog/article-exam-skills.html 至 quizmate-cn。全部 UPLOAD_OK。
- 线上验证：https://www.quizmate.vip/suite/latest.yml 返回 version 2026.8.20 与新 sha512（老客户端 electron-updater 将自动提示更新）；https://quizmate.cn/download.html Windows 卡片版本 2026.8.20 且链接指向新 exe。
- 旧版本 2026.8.18 的 exe 对象未被覆盖（新包为独立文件名），仍可回滚。

### 5.3 回滚路径（注意：本次 OSS 侧 rollback 备份实际未生效）

- 发现并修复脚本 bug：原 backup() 的 `client.copy(object, rollback)` 参数顺序颠倒（copy(name, sourceName) 应为 copy(rollback, object)），导致 head 通过后 copy 因源不存在抛 NoSuchKey 被 catch 吞掉、日志误打 BACKUP_SKIP；该 bug 同样存在于 2026-08-19 的 windows 发布脚本。已在 20260820 脚本中修正，后续发布才会真正产生 `rollback/2026.8.20/` 备份对象。
- 本次实际回滚方式：
  1. 自动更新回滚：将本目录 `rollback-latest-yml-2026.8.18.yml` 内容（部署前线上抓取存档）覆盖上传 quizmate-vip 的 `suite/latest.yml`，客户端即回到 2026.8.18 更新通道；
  2. 官网页面回滚：`git checkout` 恢复 download.html / index.html / blog/article-exam-skills.html 后用发布脚本重传；
  3. 直装回滚：`downloads/QuizMate-Windows-2026.8.18.exe` 仍在线上，可直接分发旧包。

### 5.4 发布后待观察

- 老客户端（2026.8.18 及更早）自动更新到 2026.8.20 的成功率与安装完整性。
- DT-032/DT-033 的真实用户反馈：填空/输入题场景下按钮兜底的可用性、悬停穿透恢复是否正常。

## 6. 待人工实测项（阻塞清单）

1. DT-032：悬浮窗头部按钮触发截图->搜题->复制全链路；鼠标移开后穿透恢复；窗口 Ctrl+方向移动后穿透复位；悬浮窗不遮挡考试页面点击。
2. DT-033：托盘右键菜单"全屏截图/搜题"在悬浮窗隐藏时自动拉起悬浮窗并执行；voice 模式下"搜题"走截图+播报链路。
3. 复现场景验证：考试输入框聚焦 + 中文输入法开启时 Alt+Q/Alt+E 失效 -> 改用按钮/托盘仍可完成答题流程。
4. IV-PROMPT-001~003 线上冒烟：部署后真实调用 generateInterviewAnswer，确认双层结构、顺序（逻辑题思路在前）、岗位专家口吻、20 积分扣减不变。
5. 若管理后台已配置 interview_prompt_config 自定义提示词，需同步更新为新双层格式或清空以回落新默认值。
