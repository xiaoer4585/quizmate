# CHG-20260822-03 测试证据

执行时间：2026-08-22（Asia/Shanghai）
工作区：`E:\ai项目\考试插件`
目标：Mac 测试构建 `2026.8.26`

## 自动化结果

| 检查 | 命令 | 结果 |
|---|---|---|
| Electron 主进程类型检查 | `npm run typecheck:node` | 通过 |
| Renderer 类型检查 | `npm run typecheck:web` | 通过 |
| Electron 生产构建 | `npm run build` | 通过，生成 `out/main`、`out/preload`、`out/renderer` |
| Command+Q 防退出静态检查 | `defaultShortcutBindings.quit === ''`、Mac `Menu.setApplicationMenu(null)`、ShortcutHelper 跳过 `quit` 注册 | 通过 |
| Option 快捷键与旧配置迁移静态检查 | 截图/搜题/显示/复制/重听/听写统一使用 `⌥Q/⌥E/⌥B/⌥C/⌥R/⌥I`；旧 Command 组合迁移 | 通过 |
| 面试实现对照 | Mac/Windows `Interview.tsx`、`Overlay.tsx` 内容哈希一致；请求均携带岗位、公司、岗位描述、简历、答案风格 | 通过 |

## 必须实机验证

以下项目无法在 Windows 工作区代替 macOS 实机判定，均保持阻塞：

- macOS `Command+Q` 不退出、截图快捷键实际触发并显示截图状态。
- 屏幕录制权限允许/拒绝时的截图行为。
- 面试实时语音权限、实时 ASR、真实 AI 接口和后台提示词答案格式。
- Intel 与 Apple Silicon 安装、启动、升级和卸载。

## 正式发布结果

- 用户随后明确要求上线；GitHub Actions `32540990455` 的 Intel/Apple Silicon 两个 job 均通过构建、ad-hoc 签名、DMG 校验和架构检查，并直接上传 OSS。
- `quizmate.cn` 与 `www.quizmate.cn` 的 `mac/latest-mac.yml` 均返回 HTTP 200，版本 `2026.8.26`。
- Apple Silicon/Intel DMG 和 arm64/x64 自动更新 ZIP 四个公网 URL 均返回 HTTP 200；ZIP Content-Length 与更新清单一致。
- 官网 `download.html` 已显示 `2026.8.26` 并指向对应双架构 DMG。
- 后端、积分和后台提示词未修改。实体 Mac 的快捷键、权限、截图和实时面试 AI 全链路仍需用户安装后验收。
