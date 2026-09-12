# CHG-20260906-04 测试证据

## 变更

- Mac 笔试页“开始使用”此前调用 `window.electronAPI.permissions.authorizeAll()`，但 preload 兼容层缺少 `permissions`，导致点击后在权限检查阶段异常中断，悬浮框启动未执行。
- 在 `desktop-core/electron/preload.ts` 补齐 `getState`、`authorizeAll`、`openSettings`；在 `Exam.tsx` 增加 IPC 异常可见反馈。
- Mac 测试版本：`2026.09.06.3`（内部 SemVer `2026.9.6003`）。不修改官网、正式更新清单或生产更新通道。

## 测试包

- GitHub Actions：`33986555897`，Intel 与 Apple Silicon 均成功。
- 临时下载目录：`https://quizmate.cn/temp/mac-delivery-20260906-start-button-1/`
- [Intel DMG](https://quizmate.cn/temp/mac-delivery-20260906-start-button-1/QuizMate-Mac-Intel-2026.09.06.3.dmg)，SHA-256 `3abb37c0a6137c6c282bff01dcbd9b24622e2f1252ae243e3d8f008cfecb0388`。
- [Intel ZIP](https://quizmate.cn/temp/mac-delivery-20260906-start-button-1/QuizMate-Mac-x64-2026.09.06.3.zip)，SHA-256 `a33da5f0b7e8b9e7de5d74318d5fd420fed2fdaa196891e1bfc368d08bfa0bbb`。
- [Apple Silicon DMG](https://quizmate.cn/temp/mac-delivery-20260906-start-button-1/QuizMate-Mac-Apple-Silicon-2026.09.06.3.dmg)，SHA-256 `d7b393ffd1765c4b851a8a85b4c0c7bc8a0730a6d69f657d5356244e877c6bcd`。
- [Apple Silicon ZIP](https://quizmate.cn/temp/mac-delivery-20260906-start-button-1/QuizMate-Mac-arm64-2026.09.06.3.zip)，SHA-256 `6067f07d50eaa0ae86c75ee2fa924298fc2cf2c88a1c388a9cdeee92a8b33590`。
- 四个对象 HEAD 均为 HTTP 200；Range `bytes=0-1023` 验证返回 HTTP 206/1024 字节。临时对象不接入正式更新通道。

## 自动化回归（2026-09-06）

| 平台/项目 | 命令 | 结果 |
|---|---|---|
| macOS 目标配置 | `npm run typecheck:node` | 通过 |
| macOS 目标配置 | `npm run typecheck:web` | 通过 |
| macOS 目标配置 | `npm run test:shared` | 通过（共享用例全部通过） |
| macOS 目标配置 | `npm run test:mac-protection` | 通过（4/4） |
| macOS 目标配置 | `npm run build` | 通过 |
| Windows 目标配置 | `npm run typecheck:node` | 通过 |
| Windows 目标配置 | `npm run typecheck:web` | 通过 |
| Windows 目标配置 | `npm run test:shared` | 通过（48/48） |
| Windows 目标配置 | `npm run build` | 通过 |

## 实机验收

待用户安装 Mac 测试包后验证：权限状态显示、点击“开始使用”、Option+Q 截图、Option+E 搜题、Option+R 面试启停，以及悬浮框投屏不可见和鼠标穿透。实体 Mac 权限和快捷键不能由 CI 结果替代。

## 回滚

回滚 `desktop-core/electron/preload.ts`、`desktop-core/src/pages/Exam.tsx` 及本次版本字段即可；无数据库迁移，不涉及正式线上对象。
