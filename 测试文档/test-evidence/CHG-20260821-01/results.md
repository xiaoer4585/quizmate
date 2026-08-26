# CHG-20260821-01 Mac 2026.8.23 发布证据

- 源码提交：`55fa86d`。
- GitHub Actions：`32449413664`，Intel 与 Apple Silicon job 均成功。
- 构建检查：Node/Web 类型检查、Electron 生产构建、ad-hoc 签名、DMG 校验、x86_64/arm64 架构检查均通过。
- 公网结果：`quizmate.cn`、`quizmate.vip` 的更新清单和下载页均为 HTTP 200 且版本为 `2026.8.23`；八个包 URL 的 Content-Length 和 MD5/ETag 均与本地文件一致。
- 临时公开仓库：构建后已恢复 PRIVATE；临时构建 tag 已删除；Actions artifact 总数为 0。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `QuizMate-Mac-Apple-Silicon-2026.8.23.dmg` | 126898620 | `F94DC02B967CAE3189047F2CC47B54BAF2A8ACF4BF2ABF038C199A6B456C25BF` |
| `QuizMate-Mac-Intel-2026.8.23.dmg` | 130585229 | `2A601E783FCB45A53932D04CDC6D41C6C2E2CEAC523BF259D2C41A527EDE4521` |
| `QuizMate-Mac-arm64-2026.8.23.zip` | 126878791 | `CDE3BA32EB4EDD819F54AC031D2B61AC140FB7A9C99AB52C430EB25B2D1236E8` |
| `QuizMate-Mac-x64-2026.8.23.zip` | 128984899 | `E9B342B84A9C191C20240B8C77E346EB388E854E06BE51EADEFE66C0FC17A8FF` |

实体 Mac 的系统权限交互仍需真实设备验收，不将 CI 结果记为实体设备通过。
