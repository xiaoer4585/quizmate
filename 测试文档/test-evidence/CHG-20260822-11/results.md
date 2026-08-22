# CHG-20260822-11 测试证据

执行环境：Windows 11 x64，本地仓库 `E:/ai项目/考试插件`，版本目标 `2026.8.22.1`。

## 旧版稳定包确认

- Apple Silicon：`mac客户端/发布包/2026.8.20/QuizMate-Mac-Apple-Silicon-2026.8.20.dmg`
- Intel：`mac客户端/发布包/2026.8.20/QuizMate-Mac-Intel-2026.8.20.dmg`
- CHG-20260820-03 证据记录的 SHA-256：
  - Apple Silicon DMG：`1601AACD0A01D5762AC37A5D9E444C7C3B3E695C2FF67F36222B9B821368760B`
  - Intel DMG：`1DAC3B46569C7F1411D1099241D1302D5B4337FECB53E967A62A54714CA04E47`

## 本地自动化结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run build` | 通过，main/preload/renderer 均成功生成 |
| `git diff --check`（本次相关文件） | 通过；仅 Git 换行提示，无空白错误 |
| `node --check 其他/部署工具/prepare-mac-release-tag-20260822-11.cjs` | 通过 |
| `node --check 其他/部署工具/deploy-mac-release-20260822-11.cjs` | 通过 |
| 笔试稳定逻辑对齐扫描 | `ScreenshotHelper`、`Exam.tsx`、`ExamOverlay.tsx`、`shared/shortcuts.ts`、`TrayManager.ts` 与提交 `8e96ab5` 一致 |
| 面试响应速度扫描 | `InterviewHelper` 保留 `MAX_CONCURRENT_ANSWERS = 2`、`activeAnswerCount`、`answerWaiters` 和 `enqueueAnswer` 并发槽逻辑 |
| 下载页版本扫描 | Mac 卡片显示 `2026.8.22.1`，两个链接为 `QuizMate-Mac-Apple-Silicon-2026.8.22.1.dmg` / `QuizMate-Mac-Intel-2026.8.22.1.dmg` |
| 发布脚本目标桶扫描 | 仅包含 `quizmate-cn`，未包含 `quizmate-vip` |
| 业务版本/打包版本兼容 | Electron Builder 使用 semver `2026.8.22-1`；客户端展示、更新检测、请求头和下载 URL 使用 `resources/config.json` 业务版本 `2026.8.22.1` |

## 待云构建/发布

- `mac/latest-mac.yml` 仍待双架构 ZIP 上传后生成真实 sha512 和 size。
- Apple Silicon / Intel DMG 与 ZIP、ad-hoc 签名、`hdiutil verify`、可执行文件架构检查待 GitHub Actions macOS runner 执行。
- 正式站 `https://www.quizmate.cn/download.html`、两个 DMG URL 和 `https://quizmate.cn/mac/latest-mac.yml` 待发布后公网验证。
- 原计划使用带 OSS PUT 签名 URL 的 tag 触发上传，被安全审查拦截，原因是签名 URL 写入 Git tag 存在凭据外泄风险。
- 改用“推送代码分支后手动触发 GitHub Actions artifact，再本机上传 OSS”的更安全方案时，分支推送也被安全审查拦截，原因是需要用户明确授权向指定 GitHub 远端发布私有仓库内容。
- 用户随后明确授权使用 `https://github.com/xiaoer4585/quizmate`；运行 `32550241802` 双架构构建通过。首轮发现 Electron Builder 将四段 `2026.8.22.1` 规范化为包内 `2026.8.2-2.1`，已修复为 semver 打包版本 `2026.8.22-1` + 业务版本 `2026.8.22.1`，需重跑云构建。

## 阻塞项

- 实体 Mac 屏幕录制权限、全局快捷键、真实笔试截图/AI 搜题、麦克风/系统音频和真实面试 AI 链路无法在 Windows 本地推断通过，发布后需 Apple Silicon 与 Intel 实机验收。
- 云构建/官网正式发布当前阻塞：等待用户明确授权使用 GitHub 远端 `git@github.com:wangxiaoer4585/quizmate.git` / 分支 `codex/mac-20260822-1`，或提供可直接构建 DMG/ZIP 的受控 Mac 环境。
