# CHG-20260822-15 自动化验证记录

- 版本：`2026.8.22.3`
- 平台：Windows 11 本地开发机；Mac 双架构打包待 GitHub Actions macOS runner 执行。
- 发布边界：只上传阿里云 OSS 测试安装包直链，不更新官网 `download.html`，不更新正式 `mac/latest-mac.yml`。

## 本地结果

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `npm run build`：通过。

## 待远端完成

- GitHub Actions 双架构 DMG/ZIP 构建：通过，run `32572673273`。
- Apple Silicon / Intel 产物上传到阿里云测试对象：通过。
- 公网 HTTP HEAD 校验下载链接：通过。

## 阿里云公网校验

- Apple Silicon DMG：`https://quizmate.cn/downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.3.dmg`，HTTP 200，`126912405` bytes。
- Intel DMG：`https://quizmate.cn/downloads/QuizMate-Mac-Intel-2026.8.22.3.dmg`，HTTP 200，`130572530` bytes。
- arm64 ZIP：`https://quizmate.cn/mac/QuizMate-Mac-arm64-2026.8.22.3.zip`，HTTP 200，`126885064` bytes。
- x64 ZIP：`https://quizmate.cn/mac/QuizMate-Mac-x64-2026.8.22.3.zip`，HTTP 200，`128991180` bytes。
- 正式更新清单：`https://quizmate.cn/mac/latest-mac.yml` 仍为 `version: 2026.8.20`，本次未更新官网/自动更新入口。

## 阻塞项

- Apple Silicon/Intel 实机安装启动、麦克风/屏幕录制授权、真实面试音频识别、支付二维码扫码支付、邀请数据真实账号链路：需用户在实体 Mac 和测试账号上验收，不能由 Windows 本机推断通过。
