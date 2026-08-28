# Implementation Plan

- [x] 1. 建立 CHG-20260828-04 测试与回滚基线
  - 在 `测试文档/多个版本的客户端的测试文档.md` 顶部新增 `CHG-20260828-04`，记录范围、风险、基线提交、受影响文件、环境、证据目录和回滚步骤。
  - 在统一桌面用例表新增 DT-044～DT-051：首次启动权限向导、截图阶段诊断与失败保图、系统音频承载轨生命周期、音轨/AudioContext 恢复、ASR 重连、后台/UI 状态一致性、诊断脱敏、笔试/面试性能。
  - 明确自身题目截图不得包含 QuizMate 悬浮框；保留 PR-004/PR-010/PR-012 的合规边界，不实现或验证第三方截图、录屏、投屏中的答案隐身。
  - 建立 `测试文档/test-evidence/CHG-20260828-04/`，记录修改前提交、版本、配置、关键文件 SHA-256 和实体 Mac 阻塞项。
  - _Requirements: R1, R3, R4, R9, R10, R11_

- [ ] 2. 实现共享可靠性类型、错误模型与状态机
  - 在 `desktop-core/shared` 新增分析阶段、诊断错误、面试会话阶段、组件健康快照和恢复动作类型。
  - 实现纯状态转换与 generation 校验，区分用户 `desiredRunning` 和当前传输健康状态。
  - 为 Electron/Renderer 边界负载增加类型守卫，替换本次涉及路径中的宽泛 `any`。
  - 增加 Vitest 基础配置和共享测试脚本，使 Mac/Windows 壳均可运行同一状态机测试。
  - _Requirements: R1, R5, R7, R8, R10_

- [x] 3. 实现首次启动权限向导与真实能力预检
  - 在本地配置中增加带版本的 onboarding 状态，只记录引导完成/实测结果，不缓存或伪造 macOS 权限。
  - 全新安装首次启动、进入工作台前展示屏幕录制、麦克风、电脑声音三步向导。
  - 屏幕录制通过非空、非黑屏测试帧验证；麦克风和系统音频通过活动轨与电平验证。
  - 系统音频测试由用户点击后打开标准共享选择器；拒绝、跳过和需要重启分别显示准确状态。
  - 升级安装在权限仍有效时不重复打扰；权限被撤销后恢复修复提示。
  - 在 Windows 端将该向导标记为不适用或使用现有平台权限路径，避免共享页面回归。
  - _Requirements: R3, R4, R8, R10_

- [ ] 4. 重构截图捕获、校验和分析诊断链路
  - 为一次截图分析建立 `operationId`，贯穿权限、捕获、图像校验、保存、压缩、上传、后端请求和解析。
  - 改造 `ScreenshotHelper` 返回结构化阶段和稳定错误码，检测空图、黑屏、异常尺寸、损坏图片和编码失败。
  - 保持 QuizMate 自身截图前临时隐藏悬浮框、截图后可靠恢复，并增加捕获前后状态验证。
  - 将压缩函数改为返回方法、耗时、输入/输出大小和明确错误，不静默吞掉编码失败。
  - 改造 `ProcessingHelper` 的 requestId/attempt：结果不明的超时重试复用幂等 ID，明确失败后的新尝试生成新 ID并关联父 operation。
  - 只有答案成功解析并发出完成事件后才清空对应截图；所有失败保留截图并允许重试。
  - _Requirements: R1, R2, R3, R9, R11_

- [ ] 5. 重构 Mac 音轨与音频图生命周期
  - 将隐藏窗口内自由变量收敛为 `VoiceRuntime`，统一管理轨道、节点、计时器、WebSocket 和 teardown。
  - 保留系统共享的承载视频轨至会话 teardown，仅禁用且不接入音频图；不得在取得系统音频后立即停止它。
  - 分别监听显示承载轨、系统音频轨和麦克风轨的 `ended/mute/unmute`，按正式/演示模式执行恢复或降级。
  - 监听 `AudioContext.statechange`，对 `suspended/interrupted` 有限 resume，失败后重建音频图。
  - 添加轻量音源电平和最后音频帧时间；长静音不停止会话，轨道/上下文异常才触发恢复。
  - 保证 teardown 移除监听器、停止全部轨道、断开节点并清理连接，不遗留共享指示或麦克风占用。
  - _Requirements: R4, R5, R6, R9_

- [x] 6. 实现 ASR 重连、隐藏窗口恢复和主进程健康控制器
  - 初次 ASR 连接和重连复用统一初始化函数，正确重置 WAV 头、序列号和请求配置。
  - 增加 socket generation，旧连接的 close/error/message 不得覆盖新连接。
  - 实现 0.5/1/2/4/5 秒有上限退避和 `reconnecting` 状态；超过 6 次进入 `action-required`。
  - 监听 `render-process-gone`、`did-fail-load`、窗口销毁和连续轮询失败；用户意图仍为运行时重建隐藏窗口一次。
  - 主进程广播完整 `VoiceHealthSnapshot`，并实现幂等 start/stop/retry/restart。
  - _Requirements: R5, R6, R7, R8, R9_

- [x] 7. 对齐 InterviewHelper、IPC、主页面和悬浮窗状态
  - `InterviewHelper` 从健康快照派生运行状态；重连/恢复不取消 transcript 或在途答案，用户主动停止才终止会话。
  - 手动输入问题不再强制启动音频采集，确保权限异常时仍有可用兜底。
  - 新增 `interview:getState`、`interview:stateChanged`、重试采集和诊断 IPC，并保持旧 transcript 事件兼容。
  - 面试页增加电脑声音、麦克风、音频处理、语音识别四节点状态轨，后台快照是唯一真值。
  - 截图失败区显示具体阶段、错误码、恢复建议和短请求标识；复制诊断通过主界面或托盘触发，悬浮窗继续鼠标穿透。
  - 复用现有 Slate/青/绿/琥珀/玫红色 token、PingFang SC/Segoe UI 字体链和 Lucide 图标，不引入新页面或远程资源。
  - _Requirements: R1, R4, R5, R8, R9_

- [ ] 8. 实现统一脱敏日志与性能计时
  - 将截图和面试日志统一为有大小上限的 JSON Lines，增加 session/operation、版本、平台、架构、阶段、耗时和恢复次数。
  - 实现日志滚动、当前会话摘要复制和打开日志目录；写入失败不得中断业务。
  - 添加严格字段白名单和敏感模式扫描，禁止截图、音频、转写、简历、完整路径、令牌、API Key 和签名 URL。
  - 记录截图捕获/校验/压缩/上传/网关/后端模型/解析/渲染，以及面试 transcript commit/请求/回答阶段耗时。
  - 确保本地状态 100ms 内反馈、截图客户端后处理 P95 ≤ 1.5s、面试提交后发请求 P95 ≤ 300ms。
  - _Requirements: R1, R9, R11_

- [ ] 9. 完成自动化、双端构建和安全回归
  - 运行新增状态机、音轨生命周期、重连、截图错误映射、幂等和日志脱敏测试。
  - 运行 Mac `typecheck:node`、`typecheck:web`、Electron production build。
  - 运行 Windows `typecheck:node`、`typecheck:web`、Electron production build 和受影响的共享桌面回归。
  - 运行 `git diff --check`、敏感信息扫描、IPC 白名单检查和包内版本/更新源检查。
  - 执行固定题图/问题至少 20 次的可自动化性能采样；保存全部样本并计算 P50/P95，不删除慢样本。
  - 将命令、时间、平台、结果和失败重跑记录写入 CHG-20260828-04 证据目录和统一测试文档。
  - _Requirements: R2, R6, R7, R9, R10, R11_

- [x] 10. 提交 Gitee 并生成 Mac 双架构隔离测试包
  - 提交前复核 diff 只包含本规格、共享桌面修复、Mac 壳适配、测试和证据，不带 Windows 安装包或无关用户文件。
  - 将正常代码历史推送 Gitee 分支；GitHub 仅同步同一批准构建提交/标签以运行 Mac Actions，不作为代码管理基线。
  - 在 GitHub Actions 分别构建 Intel/Apple Silicon DMG/ZIP，校验合法 SemVer、业务版本、架构、DMG 完整性和 ad-hoc/正式签名状态。
  - 下载并校验产物 SHA-256、大小和包内代码标记；任何构建或架构失败均阻断交付。
  - 将测试包上传阿里云 OSS `temp/mac-capture-interview-<version>/`，生成有时效的临时链接；不修改官网、正式对象或 `mac/latest-mac.yml`。
  - _Requirements: R3, R4, R10_

- [ ] 11. 完成实体 Mac 验收与失败闭环
  - Apple Silicon 与 Intel 分别执行全新安装、首次权限向导、拒绝/允许/撤销/跳过、授权后重启和升级保留。
  - 验证有效截图不包含 QuizMate 自身悬浮框、AI 成功回答、失败保图/诊断/重试和积分一致性。
  - 验证真实扬声器音频、演示双轨、正式系统音频、用户停止共享、AudioContext 恢复和隐藏窗口恢复。
  - 连续运行 30 分钟，覆盖长静音、隐藏窗口、一次断网重连、睡眠唤醒和后续问题继续识别。
  - 使用固定题图/问题采集至少 20 次生产式性能样本，确认笔试 10/20 秒、面试 8/15 秒 P50/P95 目标或记录外部瓶颈。
  - 保留首个失败证据，修复后重跑失败用例及周边回归；实体设备未完成时必须标记“阻塞”，不得写“通过”。
  - _Requirements: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11_

- [ ] 12. 验证回滚并形成发布结论
  - 验证代码 revert 后上一稳定 Mac 客户端仍可登录、截图/分析和卸载重装；新日志/本地 onboarding 状态可被旧版安全忽略。
  - 执行 RB-007、RB-008、P0 冒烟、兼容集合和当前 Windows 正式版共享逻辑回归。
  - 在统一测试文档记录可发布/不可发布结论、残余风险、证据链接和回滚结果。
  - 正式上线必须等待 P0/P1 全部通过和用户另行明确指令；本任务阶段不更新官网或用户自动更新通道。
  - _Requirements: R2, R5, R9, R10_

- [x] 13. 实现旧 ad-hoc 权限的一次性迁移
  - 新增只在 macOS、正式安装路径和新迁移版本首次启动时运行的 TCC 迁移器。
  - 使用无 shell 的固定参数进程，仅重置 `vip.quizmate.mac` 自身权限；记录退出码与脱敏错误，成功后写入全局幂等标记。
  - 迁移后清除旧 onboarding 完成态，拒绝从 DMG/下载目录直接完成迁移。
  - _Requirements: R12_

- [x] 14. 将逐项权限测试改为单按钮授权状态机
  - 增加统一 `authorizeAll` IPC，按顺序请求麦克风、屏幕录制和系统音频并持续返回真实状态。
  - 音轨 `live` 即确认能力可用；零电平只表示当前静音，不再要求用户播放声音。
  - 需要系统设置或重启时提供唯一主操作，重启后自动继续。
  - _Requirements: R3, R4, R12_

- [x] 15. 强化悬浮窗鼠标穿透与自有截图排除
  - 将两类悬浮窗的输入透明参数集中到共享 helper，在 create/show/ready/recovery 后幂等应用。
  - 禁止 Renderer 把答案悬浮窗临时改为可交互；通过快捷键或主界面完成控制。
  - 自有截图事务统一隐藏全部 QuizMate 悬浮窗并在 finally 恢复。
  - 公开内容保护仅记录真实能力状态，不实现私有捕获规避。
  - _Requirements: R3, R13_

- [x] 16. 配置稳定签名、公证与发布阻断
  - 启用 Hardened Runtime 和最小 Electron entitlements，支持 Developer ID Application 签名和 notarization/staple。
  - 正式标签缺少固定 TeamIdentifier 或公证凭据时直接失败；隔离测试构建明确标记不可发布。
  - _Requirements: R10, R12_

- [ ] 17. 完成权限迁移与输入隐私回归
  - 执行新增迁移幂等、统一授权、静音音轨、鼠标穿透状态和自有截图窗口恢复自动化。
  - 实体 Mac 执行旧包覆盖、全新安装、拒绝恢复、双架构、签名公证、系统授权和底层鼠标交互验证。
  - _Requirements: R10, R12, R13_
