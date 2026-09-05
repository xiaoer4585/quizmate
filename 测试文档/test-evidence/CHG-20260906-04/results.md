# CHG-20260906-04 发布验收证据

## 发布对象

- 发布分支：`codex/windows-release-20260906`
- 发布提交：`fb7ab991e0ac5311686c647a502e739729a3b86e`
- 发布后文档提交：`21823c1`，仅补充本次发布验收证据和主测试文档状态
- 正式标签：`windows-publish-20260906-1`
- 对外版本：`2026.09.06`（用户版本 `2026.9.6`）
- 内部 SemVer：`2026.9.6000`
- GitHub Actions：`33981162810`，Windows ia32 构建、架构校验和正式包上传通过

## 源码同步

- Gitee `origin/main`：`21823c1`（包含发布提交及发布后文档记录）
- Gitee `origin/windows-publish-20260906-1`：已验证指向正式标签
- GitHub `main`：`21823c1`（包含发布提交及发布后文档记录），通过 GitHub API 验证
- GitHub `windows-publish-20260906-1`：通过 GitHub API 验证并解析到提交 `fb7ab991e0ac5311686c647a502e739729a3b86e`
- 本次未创建额外 GitHub Release 页面，正式客户端以仓库标签和官网更新通道发布

## 正式包

- 官网下载：`https://quizmate.cn/downloads/QuizMate-Windows-2026.09.06.exe`
- 更新清单：`https://quizmate.cn/suite/latest.yml`
- 备用清单：`https://quizmate.cn/downloads/latest.yml`
- 文件大小：`82,859,872` 字节
- SHA-256：`b867a8c353b13b13c139880db0f6bbebf6b7732e898022b053bab5fa15510579`
- 清单核心内容：`version: 2026.9.6000`，文件 `QuizMate-Windows-2026.09.06.exe`

## 公网验收

2026-09-06 在发布环境执行 HEAD 检查，以下 URL 均返回 HTTP 200；下载文件 `Content-Length` 为 `82859872`，与发布包大小一致：

- `https://quizmate.cn/suite/latest.yml`
- `https://quizmate.cn/downloads/latest.yml`
- `https://quizmate.cn/downloads/QuizMate-Windows-2026.09.06.exe`
- `https://quizmate.cn/download.html`
- `https://quizmate.cn/index.html`

GitHub Actions 已完成正式构建和包内校验；正式客户端仅发布 Windows ia32。Mac、Android、浏览器扩展未随本次发布变更。

## 回滚

- 备份目录：`quizmate-cn/rollback/CHG-20260906-04/`
- 已备份正式清单、官网页面、博客页和 Windows 操作手册。
- 回滚方式：恢复该目录中的 `suite/latest.yml`、`downloads/latest.yml`、官网页面和手册；保留旧版本化安装包，不移动正式标签。

## 结论

正式发布完成，自动更新已映射到 Windows `2026.09.06`。本次没有发布 Mac 或其他平台，也没有修改原工作区未纳入发布的改动。
