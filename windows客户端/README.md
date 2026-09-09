# Windows 客户端

- `QuizMate-Windows`：当前有效 Windows 客户端源码。
- `desktop-core`：Windows / Mac 共享的桌面公共逻辑。
- `正式安装包/YYYY-MM-DD/版本号/`：按发布日期和公开版本号保存正式上线安装包及校验文件。

Windows 公开构建线只保留一条，不再按型号拆分。正式代码不依赖历史安装包或归档目录。

当前版本：

- 公开版本：`2026.09.10`
- 内部版本：`2026.9.10000`
- 当前源码始终在 `QuizMate-Windows`；公共 Electron/React 代码按既有架构保留在仓库根目录 `desktop-core`，不复制历史源码快照。
- 测试包、`win-unpacked`、旧 release 目录和失败版本不进入 `正式安装包`。
