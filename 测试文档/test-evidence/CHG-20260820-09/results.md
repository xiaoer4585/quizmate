# CHG-20260820-09 发布证据

- 发布版本：Mac `2026.8.22`
- GitHub Actions：`32382650631`，Intel 与 Apple Silicon job 均成功。
- 构建检查：Node/Web 类型检查、Electron 生产构建、ad-hoc 签名、DMG 校验、x86_64/arm64 架构检查均通过。
- 发布范围：双架构 DMG、双架构自动更新 ZIP、`mac/latest-mac.yml`、官网 `download.html` 与 `index.html`。
- 公网结果：`quizmate.cn`、`quizmate.vip` 的更新清单和下载页均为 HTTP 200 且版本为 `2026.8.22`；八个包 URL 的 Content-Length 和 MD5/ETag 均与本地文件一致。
- 回滚：两个 OSS 桶的 `rollback/CHG-20260820-09/`；旧版 `2026.8.21` 版本化安装包继续保留。
- 临时公开仓库：构建后已改为 PRIVATE；临时构建 tag 删除；Actions artifact 总数为 0。

## 正式包

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `QuizMate-Mac-Apple-Silicon-2026.8.22.dmg` | 126894079 | `B439F12323E842DC4096D2FD97D1AE3FB26A67A8763F4882A589F6EA1F9AF95A` |
| `QuizMate-Mac-Intel-2026.8.22.dmg` | 130586329 | `BC72BBD18B70122A2F4439DFA82CC0D8E1A1776CDB1178C931EDE10B1362D77A` |
| `QuizMate-Mac-arm64-2026.8.22.zip` | 126877424 | `A01CF6939C3DD05B6E9B39699BBF1F55A96B247B12BAE883CF71D706AC18026E` |
| `QuizMate-Mac-x64-2026.8.22.zip` | 128983528 | `5810577E31836E47B9756BF263FBCB8E58244FF945E118CB0C415E64E2F363A7` |

## 限制

实体 Mac 的屏幕录制、系统音频和麦克风权限交互无法由 Windows 或 GitHub runner 代替，未将其标记为实体设备通过。
