# CHG-20260906-05 Mac 2026.09.06 发布结果

- 发布提交：`139fb1c` 之后合并 Gitee 主线的发布提交 `ecce000`，最终补充平台断言修复后 GitHub/Gitee `main` 为 `139fb1c`。
- 发布标签：`mac-publish-20260906-prod-20260906101017`，已同步 GitHub 与 Gitee。
- GitHub Actions：`34005934265`，Intel 与 Apple Silicon 均成功；共享测试、MacProtection、类型检查、DMG/ZIP 架构校验和启动冒烟通过。
- 正式版本：公开版本 `2026.09.06`，内部 SemVer `2026.9.6000`。
- 正式对象：
  - `downloads/QuizMate-Mac-Apple-Silicon-2026.09.06.dmg`：SHA-256 `1eb34cc9cb0f21f3e4c56e7c5df9bc96e1badccee35a625e88d22c130c4a4fee`，109,465,691 字节。
  - `downloads/QuizMate-Mac-Intel-2026.09.06.dmg`：SHA-256 `f91eb96215e16fe32f9881bfcc914cc4c63c2f61d985bbe90b5beaa97d149b55`，117,920,885 字节。
  - `mac/QuizMate-Mac-arm64-2026.09.06.zip`：SHA-256 `a491c2e3df8ba9c5c03d55f24f64096584ae87ba38d7901c14043eab39663f51`，105,320,475 字节。
  - `mac/QuizMate-Mac-x64-2026.09.06.zip`：SHA-256 `58fb55509cf45db871ce9ff6029424796148bf20ddb2809326d5cb301b7bdd27`，112,316,098 字节。
- 更新清单：`https://quizmate.cn/mac/latest-mac.yml` 已写入 `2026.9.6000`，arm64/x64 ZIP SHA-512 和大小与正式对象一致。
- 官网：`https://www.quizmate.cn/download.html`、`https://www.quizmate.cn/` 已更新 Mac 版本、DMG 链接和 `QuizMate-客户端使用操作手册.pdf` 下载入口；相关对象 HTTP 200，安装包 Range HTTP 206。
- 回滚：正式可变对象备份于 `quizmate-cn/rollback/CHG-20260906-05/`；旧正式 Mac 版本对象保留。
- 清理：删除 `quizmate-cn/temp/mac-*` 历史测试对象 72 个；删除 GitHub/本地 `mac-build-*`、`mac-delivery-*`、`mac-test-*` 测试标签。未删除正式版本对象。
- 签名说明：本仓库当前生产 Mac workflow 仍执行 ad-hoc 重签，未配置 Developer ID/公证凭据；安装后首次使用可能需要用户在系统设置中允许权限，不能视作公证包。
