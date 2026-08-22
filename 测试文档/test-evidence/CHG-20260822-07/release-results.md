# CHG-20260822-07 发布证据

- 版本：`2026.8.28`
- GitHub Actions：运行 `32546159009`，Intel 与 Apple Silicon 构建均通过；DMG/ZIP 校验、ad-hoc 重签名、架构检查通过。
- 发布时间：2026-08-22 11:00（Asia/Shanghai）
- 发布范围：两个 OSS 桶的四个 Mac 产物与 `mac/latest-mac.yml`；未修改 `download.html` 或其他官网 HTML。
- 回滚位置：`quizmate-cn`、`quizmate-vip` 的 `rollback/CHG-20260822-07/`。

## 产物

| 对象 | 大小（字节） | 状态 |
|---|---:|---|
| `downloads/QuizMate-Mac-Apple-Silicon-2026.8.28.dmg` | 126908423 | 已发布 |
| `downloads/QuizMate-Mac-Intel-2026.8.28.dmg` | 130581487 | 已发布 |
| `mac/QuizMate-Mac-arm64-2026.8.28.zip` | 126881068 | 已发布 |
| `mac/QuizMate-Mac-x64-2026.8.28.zip` | 128987172 | 已发布 |

## 公网验收

- `https://quizmate.cn/mac/latest-mac.yml`：HTTP 200，版本 `2026.8.28`。
- `https://quizmate.vip/mac/latest-mac.yml`：HTTP 200，版本 `2026.8.28`。
- 两个域名下的 Apple Silicon/Intel DMG 和 arm64/x64 ZIP 均 HTTP 200，Content-Length 与上表一致。
- 更新清单 SHA-512：arm64 `qtEmggT28SJh7XMTdzcl4O1mARlY4GD79WK+FHTw+svHGXeYKeKjl4h4Z6VbDKrAPzxWDqfCZ09gUNeDTUR33A==`；x64 `qQ8D8FiI2/twF7zcHQxfN+B1I97r+gLOVTCW28uNPwcJ/d7tqyrTZOBsmfGTtL4avr0Q8uiS68F4UhulxqJwkg==`。

## 平台边界

- Windows CI 无法验证实体 macOS 的屏幕录制授权、Option 全局快捷键、麦克风/系统音频和真实 AI 全链路，相关 MANUAL 用例保持“阻塞/待实机验收”。
