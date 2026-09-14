# CHG-20260914-01 验证结果

- 基线：已上线 Windows 代码提交 `0cff1df`，下载对象校验提交 `98b49dd`。
- WorkTree：`C:/Users/Administrator/.codex/tmp/quizmate-windows-signing-capture-hide-20260913`。
- 分支：`codex/windows-signing-capture-hide-20260913`。
- 变更：积分流水显示和扣费后实时余额刷新；面试模式保留截图/搜题快捷键；悬浮框窗口实例生命周期隔离；退出阶段 IPC 销毁保护；补齐双机、隐私和快捷键验收表。

## 自动化

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run test:shared -- --run` | 通过，10 个文件 / 74 个测试 |
| `npx electron-vite build` | 通过 |
| `npx electron-builder --win --ia32 --publish never --config.directories.output=release/CHG-20260914-01` | 通过 |
| 包内 `verify-packaged-app.cjs` | `PACKAGED_APP_OK version=2026.9.14001 arch=i386 asar=46511186` |

## 测试包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260914-01/QuizMate-Windows-2026.9.14001.exe`
- 大小：`82,806,475` bytes
- SHA-256：`AA4AAA546D958A001E704226F7A7170813866B997040E7645A07692F675E3546`
- 更新地址：`https://quizmate.cn/temp/CHG-20260914-01`（仅写入包配置，未上传）
- Authenticode：`NotSigned`（本地构建未配置代码签名证书）
- 发布边界：未上传、未上线、未修改官网、正式更新清单或原工作区；Mac 未构建。

## 实机待验收

10 项完整验收表已写入 `测试文档/多个版本的客户端的测试文档.md`，包括 Windows/macOS 快捷键差异、悬浮框截图/录屏隐私和鼠标穿透、三图搜题、语音播报、面试音频模式和长问题、双机配对与手机面试、网申官网跳转。余额真实扣减、窗口切换、正常退出、安装卸载及手机联调仍待用户在 Windows 实机验证。
