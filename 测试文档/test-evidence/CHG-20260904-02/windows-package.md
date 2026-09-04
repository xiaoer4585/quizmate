# CHG-20260904-02 Windows 测试包证据

- 内部 SemVer：`2026.9.4000`
- 界面业务版本：`2026.9.4`
- 本地文件：`windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.9.4000.exe`
- 文件大小：`82,862,230` bytes
- SHA-256：`A929AB9DEA9FDC6AD56887E87FE20AEE8DC94F2558F8379403E37F3E322E381F`
- Authenticode：`NotSigned`（测试包当前无代码签名，Windows 可能显示 SmartScreen 提示）
- 架构：`i386 / ia32`，单 NSIS 安装包覆盖 32 位与 64 位 Windows
- 临时下载：`https://quizmate.cn/temp/CHG-20260904-02/windows/QuizMate-Windows-2026.9.4000.exe`

## 打包与静态核验

- `npm run package:win`：通过。
- `verify-packaged-app.cjs release/win-ia32-unpacked`：`PACKAGED_APP_OK version=2026.9.4000 arch=i386 asar=46904300`。
- 打包内 `app-update.yml` 仅指向现有 `https://quizmate.cn/suite/`，本轮没有上传或修改该目录内容。
- 临时对象公网 HEAD：HTTP 200，`Content-Length=82862230`，`Content-Disposition=attachment`。
- 上传前后比对的受保护 OSS 对象：`suite/latest.yml`、`downloads/latest.yml`、`download.html`、`index.html` 指纹一致。
- 仅上传安装器到 `temp/CHG-20260904-02/windows/`；没有上传本地 `latest.yml`、blockmap、官网文件或 Mac 产物。

## 手工复测重点

1. 登录后工作台自动检测一次更新，工作台“检测更新”可手动触发；笔试页不再出现该按钮。
2. Alt+B 只显隐笔试悬浮框；Alt+R 同时开始/结束听写和面试悬浮框；两者自定义后立即生效。
3. 两个悬浮框按不同顺序启动，后启动者位于更上层，移动/缩放/透明度/界面缩放/复位只作用于最近启动或显示者。
4. 搜题完成后再按 Alt+Q，新截图立即替换旧答案视图；上一轮迟到结果不得覆盖新截图，不需要 Ctrl+Shift+T 重置。
5. 面试听写运行时启动笔试助手并截图搜题，听写不中断；关闭任一悬浮框不影响另一助手。
6. 两个悬浮框均保持鼠标穿透；QuizMate 自身截图前临时隐藏、截图后恢复。禁止把本轮测试扩展为第三方录屏/投屏规避验证。
7. “问题反馈”和网申插件动态下载当前会明确报告服务端未部署；待后端 action 在获准的测试/生产环境部署后再做成功链路验收。
