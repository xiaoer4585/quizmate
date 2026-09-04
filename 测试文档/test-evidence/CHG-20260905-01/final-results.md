# CHG-20260905-01 Windows 正式发布结果

- 发布时间：2026-09-05 +08:00
- 发布范围：仅 Windows；Mac 未发布
- 分支：`main`
- 客户端发布提交：`1558599dca104dd948c517d060a6962194faed47`
- 正式标签：`v20260905`（解引用后指向上述客户端发布提交）
- Git 远端：Gitee `origin` 与 GitHub `xiaoer4585/quizmate`

## Windows 产物与 CI

- GitHub Actions：`33894854730`，状态 `completed/success`
- Job：`Windows ia32 universal installer`，状态 `success`
- 对外版本：`2026.09.05`
- 内部 SemVer：`2026.9.5000`
- 架构门禁：`PACKAGED_APP_OK version=2026.9.5000 arch=i386`
- 更新源：`https://quizmate.cn/suite/`
- 正式安装包：`QuizMate-Windows-2026.09.05.exe`
- 大小：`82,858,936` 字节
- SHA-256：`EDCCFF84659ED5D65643157321CF61897AD1545016177DF296D3D4E1B95BBE6D`
- blockmap SHA-256：`1D3525CA0B74A96BC5E5F4DB0B75C5BAC9AAC616D57E8966946D32F3544901AA`
- 本地保留位置：`_build/releases/2026.09.05/windows/QuizMate-Windows-2026.09.05.exe`

## 生产验证

- `https://www.quizmate.cn/suite/latest.yml` 与 `https://www.quizmate.cn/downloads/latest.yml` 内容一致，版本为 `2026.9.5000`，路径与大小匹配正式安装包。
- `https://www.quizmate.cn/suite/QuizMate-Windows-2026.09.05.exe` Range 请求返回 HTTP 206，`Content-Range: bytes 0-0/82858936`。
- `https://www.quizmate.cn/downloads/QuizMate-Windows-2026.09.05.exe` Range 请求返回 HTTP 206，`Content-Range: bytes 0-0/82858936`。
- 官网首页和下载页的 Windows 入口均命中 `2026.09.05`。
- 下载页存在 `id="ai-career-tools"`，客户端网申按钮目标可落到官网对应区域。
- 反馈/公告公网复核：`getClientAnnouncements` HTTP 200；未登录 `submitFeedback` HTTP 401 `AUTH_REQUIRED`；无管理员凭据 `adminListFeedback` HTTP 403 `ADMIN_AUTH_FAILED`；后台页面 HTTP 200、218058 字节。
- 后端部署时本机服务健康检查通过；没有把仅供服务内网使用的 `/health` 路由误记为公网路由。

## Mac 未发布门禁

- Mac 正式运行 `33894856815` 已取消；Apple Silicon job 在取消前完成，Intel job 已取消，但任何 CI 成功都不视为生产发布。
- Mac 正式触发标签已从 GitHub 与本地删除。
- `mac/latest-mac.yml` 保持内部版本 `2026.8.29000`，只引用 `2026.08.29` 的 arm64/x64 ZIP。
- 官网 Mac Intel 与 Apple Silicon 卡片继续指向 `2026.08.29`。
- 下列 `2026.09.05` 生产 URL 均返回 HTTP 404：
  - `/downloads/QuizMate-Mac-Intel-2026.09.05.dmg`
  - `/downloads/QuizMate-Mac-Apple-Silicon-2026.09.05.dmg`
  - `/mac/QuizMate-Mac-x64-2026.09.05.zip`
  - `/mac/QuizMate-Mac-arm64-2026.09.05.zip`

## 回滚位置

- Windows OSS 可变对象：`quizmate-cn/rollback/CHG-20260905-01/`
- 备份对象：`suite/latest.yml`、`downloads/latest.yml`、`download.html`、`index.html`、`blog/article-exam-skills.html`
- 反馈后端：`/opt/quizmate-api-shadow.rollback-feedback-CHG-20260905-01-20260905-002708`
- 后台页面：`rollback/CHG-20260905-01/admin-web.index.before-feedback.html`
- `mac/latest-mac.yml` 未切换，因此 Mac 不需要生产回滚。

## 本地清理与保留

已删除：

- `windows客户端/QuizMate-Windows/release`
- Windows 与 Mac 两个 `out` 目录
- CHG-20260904-01 Mac 测试证据中的 Intel/Apple Silicon 两个 `release` 二进制目录
- `tmp/quizmate-api-CHG-20260905-01-feedback.tar.gz`
- `_build/releases/2026.08.29/windows/` 下 31,457,280 字节的残缺 EXE

已保留并复核：

- 2026.09.05 Windows 正式包（82,858,936 字节，SHA-256 与 OSS 一致）
- `_build/releases/2026.08.29/verify/` 中的历史正式包，其中 Windows 正式 EXE 为 82,853,545 字节
- Mac 测试构建的签名、架构、启动和哈希文字日志；未保留本地 `release` 二进制目录

## 结论与剩余人工项

Windows 已上线至 `quizmate-cn`、官网和正式更新清单；Mac 未上线。自动化、CI、包内静态、哈希和公网发布门禁通过。DT-066 的客户端充值弹框点击体验与 DT-067 的默认浏览器跳转体验，留给用户在正式安装包升级后做最终人工复核。
