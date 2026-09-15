# CHG-20260916-01 验证结果

- 分支：`codex/windows-signing-capture-hide-20260913`，基于 `94fa89c`。
- 发布边界：仅本地 Windows 测试构建；未部署后端、未上传、未上线；Mac 未构建。

## 已执行检查

| 检查 | 状态 |
|---|---|
| Windows Node 类型检查 | 通过 |
| Windows Web 类型检查 | 通过 |
| Windows 共享测试 | 通过，10 个文件 / 74 项 |
| Windows electron-vite 构建 | 通过 |
| Windows ia32 安装包与包内审计 | 通过，`PACKAGED_APP_OK version=2026.9.16001 arch=i386 asar=46513435` |
| 后端面试专项测试 | 继承 CHG-20260915-02 阻塞：后端依赖未安装 |
| Windows 实机截图无位置/阴影残影 | 待用户验收 |
| Windows 实机面试悬浮框连续说话不晃动 | 待用户验收 |
| Authenticode 正式签名与 VirusTotal 复测 | 待用户签名后执行 |

## 修复证据

- 截图流程在两个悬浮框确认隐藏后等待至少 500ms，再调用系统截图，覆盖 DWM 残留表面和阴影的合成窗口。
- 面试/笔试悬浮框已显示且保护有效时，任务/转写刷新只更新渲染内容，不重复执行 hide/show；保护失败仍立即隐藏。
- 窗口创建仍保持 `hasShadow:false`、透明、`WDA_EXCLUDEFROMCAPTURE`、鼠标穿透和看门狗检查。

## Windows 测试包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260916-01/QuizMate-Windows-2026.9.16001.exe`
- 大小：82,808,983 字节
- SHA-256：`8ED1FCD0951A02B2FAA532148B4E59511395EABAAA5B8A3AFDD31945BD6C6087`
- Authenticode：`NotSigned`（等待用户正式签名）
