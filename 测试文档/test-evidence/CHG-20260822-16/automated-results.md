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

## 待远端完成

- GitHub Actions Intel/Apple Silicon 构建、重签名、DMG 和架构校验：待执行。
- 双架构 ZIP 内 `app.asar` 静态资源复核：待执行。
- 阿里云四个测试对象公网 HTTP 校验：待执行。
- 正式 `mac/latest-mac.yml` 保持 `2026.8.20`：待复核。

## 阻塞项

- Apple Silicon/Intel 实机安装启动、微信/支付宝真实扫码、麦克风/屏幕录制授权和真实面试音频识别：需用户在实体 Mac 上验收，不能由 Windows 本机推断通过。
