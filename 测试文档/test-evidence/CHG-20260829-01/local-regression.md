# CHG-20260829-01 本地回归

- 时间：2026-08-29（Asia/Shanghai）。
- 环境：Windows 11 x64、Node `v24.18.0`、npm `11.16.0`。
- 版本：Windows/Mac 内部 `2026.8.29000`，公开 `2026.08.29`。
- Windows `typecheck:node`：通过。
- Windows `typecheck:web`：通过。
- Windows shared tests：2 files / 13 tests 通过。
- Windows production build：通过；main 256.80 kB、preload 12.09 kB、renderer 674.56 kB。
- Mac `typecheck:node`：通过。
- Mac `typecheck:web`：通过。
- Mac shared tests：2 files / 13 tests 通过。
- MacProtection tests：1 file / 4 tests 通过。
- Mac production build：通过；main 256.80 kB、preload 12.09 kB、renderer 674.12 kB。
- 版本映射：CI 从 `package.json` 解码日期并强制与 `resources/config.json` 的零填充公开版本一致；Windows EXE、Mac 双架构 DMG/ZIP 均在校验后重命名，禁止旧包仅改名。
- 官网静态检查：下载页 Windows/Mac 均显示 `2026.08.29`，链接分别为 `QuizMate-Windows-2026.08.29.exe`、`QuizMate-Mac-Apple-Silicon-2026.08.29.dmg`、`QuizMate-Mac-Intel-2026.08.29.dmg`；首页与文章入口同步。
- 发布脚本保护：全站静态部署排除 Windows/Mac 自动更新清单，防止历史源码快照覆盖线上客户端更新状态。
- 初次并行 `npm ci` 因两个壳竞争共享依赖桥且 Electron GitHub 下载超时失败；改为顺序安装并使用 npm 镜像后一次通过。该失败不涉及源代码或测试断言。
- 待云端：Windows ia32 安装器与 PE 校验；Mac Intel/Apple Silicon DMG/ZIP、签名身份和 macOS 26 启动门禁；产物哈希、OSS、公网与自动更新清单。

