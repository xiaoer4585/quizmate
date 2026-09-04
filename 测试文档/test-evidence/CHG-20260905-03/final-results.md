# CHG-20260905-03 最终发布结果

## 发布结果

- Windows 正式版本：公开版本 `2026.09.05.1`，内部 SemVer `2026.9.5001`。
- GitHub Actions：`Build QuizMate Windows` 运行 `33901779440` 成功，构建提交 `a6e8a18bc5370858348cc941106dba771b1382c8`。
- 正式安装包：`QuizMate-Windows-2026.09.05.1.exe`，大小 `82,858,826` 字节，SHA-256 `ac95a5815760de573d4b17cce81dcf09d7fbf62037a99c7c0a35a40f8023b545`。
- 架构与更新源：安装器和解包主程序均为 PE `0x014c`（i386/ia32）；包内更新源为 `https://quizmate.cn/suite/`。
- Git：Gitee `origin/main` 与 GitHub `github/main` 已同步；正式标签 `v20260905-2` 指向上述正式构建提交。

## 阿里云与官网验证

- `suite/latest.yml` 与 `downloads/latest.yml` 内容一致，版本为 `2026.9.5001`，指向 `QuizMate-Windows-2026.09.05.1.exe`，大小和 SHA-512 与正式包一致。
- `suite/` 与 `downloads/` 两条 Windows EXE 公网入口均返回 HTTP 206，`Content-Range` 总大小均为 `82,858,826`。
- 官网 Windows 下载卡显示 `2026.09.05.1`，下载链接准确指向 `downloads/QuizMate-Windows-2026.09.05.1.exe`。
- Windows 操作手册公网 PDF 大小 `1,826,683` 字节，SHA-256 `f7aa6bc0be8e330f7f5cb0709e22ee83d25edb8b8225409ce0b5ecfa1ece399d`，共 20 页；第 12 页包含“面试过程中临时答题或 Coding”、悬浮框文字模式及 `Alt+R` / `Alt+B` / `Alt+Q` / `Alt+E` 流程。
- Mac 未发布：`mac/latest-mac.yml` 保持 `2026.8.29000`，未更新 Mac 官网卡片和安装包对象。

## 异常与处置

- 首次公网回读发现下载页链接因版本字符串替换顺序短暂形成 `2026.09.05.1.1.exe`；自动更新清单和安装包对象未受影响。
- 已将发布脚本改为对 Windows 下载链接和版本标签做幂等、定向替换，随后重新发布并验证链接为 `2026.09.05.1.exe`。

## 回滚

- 阿里云备份前缀：`quizmate-cn/rollback/CHG-20260905-03/`。
- 已备份：`suite/latest.yml`、`downloads/latest.yml`、`download.html`、`index.html`、`blog/article-exam-skills.html`、`downloads/QuizMate-Windows-Manual.pdf`。
- 如需回滚，恢复以上对象即可停止本次客户端推送并恢复旧官网下载入口；旧版本化 Windows 安装包继续保留。
