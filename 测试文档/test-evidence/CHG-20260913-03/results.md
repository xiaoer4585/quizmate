# CHG-20260913-03 验证结果

- 基线：已上线 Windows 代码提交 `0cff1df`，下载对象校验提交 `98b49dd`。
- WorkTree：`C:/Users/Administrator/.codex/tmp/quizmate-windows-signing-capture-hide-20260913`。
- 分支：`codex/windows-signing-capture-hide-20260913`。
- 变更：截图前记录并隐藏笔试/面试悬浮框，等待原生窗口确认隐藏后才截图；截图期间拦截普通显示调用；成功、失败、异常和窗口销毁路径按原状态恢复。进入双机协作时关闭 PC 笔试和面试悬浮框，移动工作区期间禁止重新显示。

## 自动化

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run test:shared -- --run` | 通过，10 个文件 / 74 个测试 |
| `npx electron-vite build` | 通过 |
| `npx electron-builder --win --ia32 --publish never --config.directories.output=release/CHG-20260913-03` | 通过 |
| 包内 `verify-packaged-app.cjs` | `PACKAGED_APP_OK version=2026.9.13003 arch=i386 asar=46509841` |

## 测试包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260913-03/QuizMate-Windows-2026.9.13003.exe`
- 大小：`82,804,398` bytes
- SHA-256：`98D67AD3D5AB70A7B21B220F7472BFC9FC27B3433464C9BD3C34C30723316F73`
- 更新地址：`https://quizmate.cn/temp/CHG-20260913-03/suite/`（仅写入包配置，未上传）
- Authenticode：`NotSigned`（当前本地构建未配置代码签名证书）
- 发布边界：未上传、未上线、未修改官网、正式更新清单或原工作区；Mac 未构建。

## 实机待验收

CAP-005 以及 CAP-006 中的 Windows 实机截图/录屏、Alt 快捷键、三图合并、双机连接、安装/卸载和正常退出仍待用户测试；待用户反馈后再决定是否修改原分支。