# CHG-20260822-16 自动化验证记录

- 版本：`2026.8.22.4`
- 平台：Windows 11 本地开发机；Mac 双架构打包由 GitHub Actions macOS runner 执行。
- 发布边界：仅上传 `quizmate-cn` 的版本化测试对象，不更新官网 `download.html`，不更新正式 `mac/latest-mac.yml`。

## 本地结果

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `npm run build`：通过。
- 构建后 renderer 检查：通过，包含四个套餐的充值/赠送/总计、微信支付、支付宝支付、开始面试和停止面试。
- 构建后 main 检查：通过，停止路径调用 `closeInterviewOverlay`，启动失败会停止听写并关闭悬浮窗，重复切换由同一 transition 串行化。
- 版本一致性：`package.json`、`package-lock.json`、`resources/config.json` 均为 `2026.8.22.4`。

## 远端构建与交付结果

- 构建提交：`32a2b06`；标签：`mac-build-20268224-1787403274444`；推送目标：`newgithub` / `xiaoer4585/quizmate`。
- Apple Silicon：云端 Node/Web 类型检查通过；应用签名验证通过；DMG checksum `VALID`；可执行文件为 `Mach-O 64-bit executable arm64`。
- Intel：云端 Node/Web 类型检查通过；应用签名验证通过；DMG checksum `VALID`；可执行文件为 `Mach-O 64-bit executable x86_64`。
- Apple Silicon ZIP 实际解包后读取 `app.asar`：`package.json` 版本为 `2026.8.22.4`；renderer 包含四个套餐、充值/赠送/总计、微信/支付宝和开始/停止面试；main 包含串行 transition、停止时关闭悬浮窗和启动失败回滚。
- macOS `Info.plist` 的 `CFBundleShortVersionString` / `CFBundleVersion` 由 electron-builder 按 Apple 三段版本约束规范化为 `2026.8.2-2.4`；客户端显示版本、包内 package 版本和公开交付文件名均为 `2026.8.22.4`。

## 阿里云公网校验

- Apple Silicon DMG：`https://quizmate.cn/downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.4.dmg`，HTTP 200，`126907628` bytes。
- Intel DMG：`https://quizmate.cn/downloads/QuizMate-Mac-Intel-2026.8.22.4.dmg`，HTTP 200，`130566862` bytes。
- arm64 ZIP：`https://quizmate.cn/mac/QuizMate-Mac-arm64-2026.8.22.4.zip`，HTTP 200，`126885057` bytes。
- x64 ZIP：`https://quizmate.cn/mac/QuizMate-Mac-x64-2026.8.22.4.zip`，HTTP 200，`128991156` bytes。
- 正式更新清单 `https://quizmate.cn/mac/latest-mac.yml` 仍为 `version: 2026.8.20`；官网下载页仍显示并链接 `2026.8.20`，本次未更新官网或自动更新入口。

## 用例结论

- DT-045：自动化/静态部分通过；真实微信/支付宝扫码支付阻塞，待用户实机测试。
- DT-046：构建后状态机与失败回滚静态检查通过；真实麦克风、系统音频和连续启停阻塞，待用户实机测试。
- PK-001、PK-004、PK-005、PK-016、PK-017：云端双架构构建与测试对象发布部分通过；实体 Mac 安装启动阻塞。
- RB-008：正式官网与更新清单保持 `2026.8.20`，无需线上对象回滚；代码可回滚到 `5b64b2c`。

## 阻塞项

- Apple Silicon/Intel 实机安装启动、微信/支付宝真实扫码、麦克风/屏幕录制授权和真实面试音频识别：需用户在实体 Mac 上验收，不能由 Windows 本机推断通过。
