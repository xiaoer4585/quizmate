# CHG-20260904-03 自动化结果

- 执行时间：2026-09-04 +08:00
- 平台：Windows 11 x64
- 源码基线：Git HEAD `4d34c9e401811f63f869fc8b5056bd49f52b1329` 加当前未提交工作区
- 客端内部版本：`2026.9.4001`

## 结果

| 检查 | 命令 | 结果 |
|---|---|---|
| Web 类型检查 | `npm run typecheck:web` | 通过 |
| Node/Electron 类型检查 | `npm run typecheck:node` | 通过 |
| 共享回归测试 | `npm run test:shared` | 4 个测试文件、29/29 项通过 |
| Production build | `npm run build` | 通过；main/preload/renderer 均成功生成 |
| Windows 隔离测试包 | `electron-builder --win --ia32 --config.directories.output=release/CHG-20260904-03` | 通过；NSIS ia32 安装包生成 |
| 安装包静态核验 | `node scripts/verify-packaged-app.cjs release/CHG-20260904-03/win-ia32-unpacked` | `PACKAGED_APP_OK`；内部版本 `2026.9.4001`，PE 架构 i386 |
| 补丁格式 | `git diff --check -- <本轮相关文件>` | 通过；仅 Git 的 LF/CRLF 预警，无空白错误 |

## 专项覆盖

- 语音模式的截图和搜题不需要创建/显示笔试悬浮框；显式显隐键仍可单独使用。
- 语音搜题只接受本次触发后产生的新截图；新截图失败时拒绝复用旧图。
- Windows `Alt+F4` / `Super+L` 与 macOS `Command+Space` / `Control+Up` 均按系统冲突拦截。
- QuizMate 系统、笔试、面试三类内部冲突分别返回指定原因。
- 修饰键顺序及 `CommandOrControl` / `Command` / `Super` / `Option` / `Alt` 别名已统一化，不能绕过冲突校验。
- Windows/macOS 当前默认可配置快捷键均通过合法性检查。

## 未自动判定项

- Windows 真实全局 Alt+E、屏幕截取与 TTS 播报需在安装包中人工验证，当前标记待用户复测。
- macOS 真实系统快捷键注册需在 Mac 实机验证；按要求未触发 Mac 构建。
- 本轮没有发布、上传、更新官网或修改正式安装包映射。

## Windows 测试安装包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260904-03/QuizMate-Windows-2026.9.4001.exe`
- 大小：82,862,040 bytes
- SHA-256：`8A8F4453F0BC63752C43098D1D2449E3ECC54FB8C433963805A01FAC2E88BE52`
- 签名：`NotSigned`，仅用于隔离测试，不可发布。
- 第一次隔离打包因本地未设置 `QUIZMATE_UPDATE_BASE_URL` 而在生成安装包前终止；随后仅对该打包进程注入官网基础地址重试并通过。未修改系统环境变量或线上更新映射。
- 为避免和上一份测试包同版本，本轮最终包递增为 `2026.9.4001`；隔离目录内中间生成的同版 `2026.9.4000` 副本已删除，上一版正式/测试文件未改动。

## 回滚验证

- 变更仅涉及共享桌面客户端代码、纯函数测试和本测试文档，没有数据库、后端、线上资源或用户数据变更。
- 可按 `baseline.md` 的文件哈希选择性恢复本轮文件；不影响 CHG-20260904-02 及其他用户未提交修改。
