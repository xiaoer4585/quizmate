# CHG-20260829-01 最终发布结果

- 发布提交：`17fca1b990d22a6269394600f84faebe89e238f4`；Gitee `origin/main`、GitHub `main` 与 tag `v20260829-3` 均已核对到该提交。
- Windows 正式构建：Actions run `33192188615` / job `98920187384`，通过；Mac 正式构建：Actions run `33192195314`，Intel job `98920210035`、Apple Silicon job `98920210266`，均通过。
- Windows 安装包：`QuizMate-Windows-2026.08.29.exe`，82,853,545 字节，SHA-256 `089c8663b6aa56f50a16fe14d74f2deceac48344ce6c68030b2af08650383372`；blockmap 87,469 字节，SHA-256 `5f2a665d74015204cc6693ccd0c95210bd3fb8910fc791bfecda5a12e6bbaf5c`。
- Mac Apple Silicon DMG：`QuizMate-Mac-Apple-Silicon-2026.08.29.dmg`，109,467,164 字节，SHA-256 `ce3b2c6e3f1c1845da00b890e27b348a1b84194bf2b242b554ee3b39834a28ce`。
- Mac Intel DMG：`QuizMate-Mac-Intel-2026.08.29.dmg`，117,916,636 字节，SHA-256 `2b76d0ce8865008ac629588e691815da6987c05f007a2b9e5b0ae427e373cd23`。
- Mac Apple Silicon ZIP：`QuizMate-Mac-arm64-2026.08.29.zip`，105,313,587 字节，SHA-256 `11a6be4c5d1225596a344dc83a9c00c2593b26332107ef027fef44459c067c1a`。
- Mac Intel ZIP：`QuizMate-Mac-x64-2026.08.29.zip`，112,309,212 字节，SHA-256 `6117618719d5673edb2b3215956e652e4f95981b551f442d13d206d11ed674d5`。
- 更新清单：
  - `https://quizmate.cn/suite/latest.yml`：`version: 2026.8.29000`，Windows SHA-512/size 与最终 OSS 对象一致。
  - `https://quizmate.cn/mac/latest-mac.yml`：`version: 2026.8.29000`，arm64/x64 ZIP SHA-512/size 与最终 OSS 对象一致。
- 包内更新源：Windows EXE 读回 `url: https://quizmate.cn/suite/`；Mac arm64/x64 ZIP 均读回 `url: https://quizmate.cn/mac/`。
- 官网：`https://www.quizmate.cn/`、`https://www.quizmate.cn/download.html`、`https://quizmate.cn/download.html` 均显示 `2026.08.29`，Windows 与两个 Mac DMG 链接均命中对应对象；首页和文章入口同步。
- 公网验证：Windows EXE、Apple Silicon/Intel DMG、arm64/x64 ZIP 的 Range GET 均返回 HTTP 206 且首段 1024 字节；下载页与首页两个正式域名均通过版本/链接标记检查。
- 阿里云：仅 bucket `quizmate-cn`；正式对象位于 `suite/`、`downloads/`、`mac/`；发布前六个可变对象备份于 `rollback/CHG-20260829-01/`，回滚脚本已实测恢复并在最终发布前重新切换。
- Mac 签名：构建通过 ad-hoc 嵌套签名、macOS 26 runner 启动和架构校验；当前没有 Developer ID Application 证书，产物未公证。首次安装可能需要用户在系统设置中允许，不能等同 Gatekeeper 正式签名；更新源和文件完整性已验证。
- 发布结论：Windows/Mac 2026.08.29 已发布并切换用户更新；Mac 的 Developer ID/公证限制已明确记录，后续取得证书后需重新签名构建以消除该限制。

