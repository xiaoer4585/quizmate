# CHG-20260905-02 Windows 测试包结果

- 执行时间：2026-09-05 +08:00
- 测试版本：对外 `2026.09.05.1`，内部 SemVer `2026.9.5001`
- 发布边界：仅 Windows 隔离测试包；未发布生产、未改官网或正式更新清单、未构建 Mac

## 实现结论

- 新增独立动作 `voice_search`，Windows 默认 `Alt+T`，Mac 共享默认为 `Option+T`（本轮不构建或发布 Mac）。
- 悬浮框文字模式的常用快捷键只展示/注册 `search`；语音播报模式只展示/注册 `voice_search`。
- 应用冷启动按持久化笔试模式注册正确动作，不再先固定注册悬浮框搜题。
- 面试助手激活快捷键期间仍读取当前笔试模式，因此双助手并行不会重新注册两个搜题动作。
- 主进程为两个动作增加模式守卫，即使模式切换与按键回调竞态发生，错误模式的动作也会直接忽略。
- `voice_search` 继续走既有“新截图 → 分析 → TTS”路径，不创建或恢复笔试悬浮框。
- 新动作进入现有冲突校验；与 `search`、系统键、QuizMate 系统键及面试键重复时禁止保存并给出原分类原因。
- 旧 `search` 自定义配置不复制给新动作，避免升级后制造重复绑定；它继续用于悬浮框模式，语音模式获得独立 `Alt+T` 默认值。

## 自动化与构建

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `npm run test:shared`：通过，5 个文件、34/34 项。
- `npm run build`：通过，main 31 模块、preload 1 模块、renderer 1725 模块。
- `npm run package:win`：通过，`PACKAGED_APP_OK version=2026.9.5001 arch=i386 asar=46909748`。
- PE 架构：安装器与 `QuizMate.exe` 均为 `0x014C`（i386/ia32）。
- 包内静态：版本、`voice_search`、`Alt+T`、语音播报搜题 UI 文案全部命中。
- 包内更新源：`https://quizmate.cn/temp/windows-voice-search-2026.09.05.1/suite/`，不读取正式 `suite/latest.yml`。

## 测试包

- 文件：`QuizMate-Windows-2026.9.5001.exe`
- 大小：`82,862,818` 字节
- SHA-256：`688B09FB8A3AB7D3AD12CF3BF5E5FDB5851CA9E110063704D65B8C54D2F1467E`
- blockmap：`87,794` 字节
- blockmap SHA-256：`B1778A055A188F779CFEE2DF876A20B0CD01C72BE75A82675F47935588D2E8D3`
- OSS 隔离前缀：`quizmate-cn/temp/windows-voice-search-2026.09.05.1/suite/`
- 公网 Range：HTTP 206，`Content-Range: bytes 0-0/82862818`
- 本地保留：`_build/test/CHG-20260905-02/windows/QuizMate-Windows-Test-2026.09.05.1.exe`
- 本地中间目录：确认独立测试包和哈希后已删除 Windows `release` 与 `out`，避免与正式包混淆。

## 生产隔离核验

- `https://www.quizmate.cn/suite/latest.yml`：仍为 `2026.9.5000`，不含 `5001`。
- `https://www.quizmate.cn/downloads/latest.yml`：仍为 `2026.9.5000`，不含 `5001`。
- `https://www.quizmate.cn/mac/latest-mac.yml`：仍为 `2026.8.29000`，未引用 `2026.09.05`。
- 官网和最新安装包映射：未修改。

## 失败与复测

- 第一次 ASAR 检查使用了错误的归档路径分隔符，命令未找到 `out/main/index.js`；改为 ASAR 内部 Windows 路径后通过。
- 第二次从仓库根运行 ASAR 复核时无法解析 Windows 壳层的 `@electron/asar`；切换到 Windows 壳目录后通过。两次均为检查命令路径问题，构建产物未修改。

## 待用户手工验证

1. 语音播报模式按默认 `Alt+T`，应自动完成新截图、搜题和播报，全程无笔试悬浮框。
2. 语音模式按悬浮框搜题键（默认 `Alt+E`）不应触发搜题；文字模式按 `Alt+T` 也不应触发。
3. 分别自定义两个搜题快捷键；设置成相同组合时必须禁止保存并提示“和笔试常用快捷键冲突”。
4. 退出时停留在语音模式，重启后第一次按 `Alt+T` 应直接生效。
5. 面试助手运行中重复切换两种笔试模式，`Alt+R` 和听写不受影响，两个搜题动作仍不串用。

> 结论：自动化与隔离测试包门禁通过，可交付用户测试；用户手工确认前不可上线。
