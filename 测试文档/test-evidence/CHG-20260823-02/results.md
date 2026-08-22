# CHG-20260823-02 Mac 重新交付证据

- 功能基线：主页、面试助手、笔试助手沿用用户已验收的 `2026.8.22.4` 代码；邀请注册、积分充值、个人中心保留当前最新实现。本次未修改这些功能文件。
- 发布版本：当天第二次发布，`2026.8.23.2`。
- GitHub：`xiaoer4585/quizmate`，提交 `191ddfd`，Actions run `32585694676`。
- 构建结果：Intel、Apple Silicon 的依赖安装、源码校验、构建、重签名、DMG/架构校验、OSS 上传和 GitHub Release 均成功。
- 对象尺寸：Apple Silicon DMG `126907163`，Intel DMG `130566456`，arm64 ZIP `126884694`，x64 ZIP `128990806` 字节。
- 线上：`download.html`、`mac/latest-mac.yml` 和四个 `.2` 下载对象已发布到 `quizmate-cn`；四个下载链接均 HTTP 200；更新清单版本为 `2026.8.23.2`。
- 回滚：当前 `.23` 官网和更新清单已由发布脚本备份到 `quizmate-cn/rollback/CHG-20260823-02/`。
- 未执行：实体 Mac 安装后的真实主页、面试、笔试操作仍需用户最终实机确认。
