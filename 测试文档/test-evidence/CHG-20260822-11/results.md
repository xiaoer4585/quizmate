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

## 云构建与发布结果

- 用户明确授权使用 `https://github.com/xiaoer4585/quizmate` 发布；代码提交 `5d01e55 release(mac): prepare 2026.8.22.1 hybrid release` 已推送到分支 `codex/mac-20260822-1`。
- GitHub Actions run `32552393717` 双架构通过：
  - Apple Silicon artifact `9470442079`，大小 `253266444`。
  - Intel artifact `9470447364`，大小 `259099121`。
- 包内版本校验：
  - `QuizMate.app/Contents/Resources/resources/config.json`：Apple Silicon 与 Intel 均为 `"version": "2026.8.22.1"`。
  - `QuizMate.app/Contents/Resources/app-update.yml`：Apple Silicon 与 Intel 均为 `url: https://quizmate.cn/mac/`。
  - `Info.plist` 打包版本为 Electron Builder semver 兼容值 `2026.8.22-1`，业务展示与更新比较使用 `resources/config.json` 的 `2026.8.22.1`。
- 本地最终包 SHA-256：
  - `QuizMate-Mac-Apple-Silicon-2026.8.22.1.dmg`：`02C87E2CB0D647F8906B78CD48724F12E094E0025F99026A6C8A1D4B7323AA63`
  - `QuizMate-Mac-Intel-2026.8.22.1.dmg`：`5CDBD3C32FEA94DE79D55351819AF58BB8B8B26C37375F527554CFF99898467A`
  - `QuizMate-Mac-arm64-2026.8.22.1.zip`：`459A11A5D91BA5DA4189812E5CF47D8A4CE63A96E432A3A2CC0B9D5B617229FE`
  - `QuizMate-Mac-x64-2026.8.22.1.zip`：`A7C90775ED0AEBF8A2FE55E8B700CB3E74AE07B449440214F141BB4C85E11798`
- OSS 发布目标仅 `quizmate-cn`。上传并远端大小校验通过：
  - `downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.1.dmg`：`126901897`
  - `downloads/QuizMate-Mac-Intel-2026.8.22.1.dmg`：`130582164`
  - `mac/QuizMate-Mac-arm64-2026.8.22.1.zip`：`126879386`
  - `mac/QuizMate-Mac-x64-2026.8.22.1.zip`：`128985496`
  - 已备份并发布 `mac/latest-mac.yml`、`download.html`。
- 公网验证通过：
  - `https://quizmate.cn/downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.1.dmg`：HTTP 200，`126901897`
  - `https://quizmate.cn/downloads/QuizMate-Mac-Intel-2026.8.22.1.dmg`：HTTP 200，`130582164`
  - `https://quizmate.cn/mac/QuizMate-Mac-arm64-2026.8.22.1.zip`：HTTP 200，`126879386`
  - `https://quizmate.cn/mac/QuizMate-Mac-x64-2026.8.22.1.zip`：HTTP 200，`128985496`
  - `https://quizmate.cn/mac/latest-mac.yml`：HTTP 200，包含 `version: 2026.8.22.1`、两个 ZIP 的真实 `sha512` 和 `size`。
  - `https://www.quizmate.cn/download.html`：HTTP 200，包含 `2026.8.22.1`、`QuizMate-Mac-Apple-Silicon-2026.8.22.1.dmg`、`QuizMate-Mac-Intel-2026.8.22.1.dmg`。

## 阻塞项

- 实体 Mac 屏幕录制权限、全局快捷键、真实笔试截图/AI 搜题、麦克风/系统音频和真实面试 AI 链路无法在 Windows 本地推断通过，发布后需 Apple Silicon 与 Intel 实机验收。
