# CHG-20260822-15 自动化验证记录

- 版本：`2026.8.22.3`
- 平台：Windows 11 本地开发机；Mac 双架构打包待 GitHub Actions macOS runner 执行。
- 发布边界：只上传阿里云 OSS 测试安装包直链，不更新官网 `download.html`，不更新正式 `mac/latest-mac.yml`。

## 本地结果

- `npm run typecheck:node`：通过。
- `npm run typecheck:web`：通过。
- `npm run build`：通过。

## 待远端完成

- GitHub Actions 双架构 DMG/ZIP 构建。
- Apple Silicon / Intel 产物上传到阿里云临时测试对象。
- 公网 HTTP HEAD/GET 校验下载链接。

## 阻塞项

- Apple Silicon/Intel 实机安装启动、麦克风/屏幕录制授权、真实面试音频识别、支付二维码扫码支付、邀请数据真实账号链路：需用户在实体 Mac 和测试账号上验收，不能由 Windows 本机推断通过。
