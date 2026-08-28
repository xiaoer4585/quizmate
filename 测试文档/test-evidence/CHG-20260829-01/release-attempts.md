# CHG-20260829-01 发布尝试与回滚

## 常规构建

- 提交：`66a4014debff0f260e638d72ef4d1b7ddda1abe3`。
- Windows run `33189945384` / job `98912566424`：通过，run number 39；ia32、版本映射、PE、生产 `app-update.yml` 和安装器均通过。
- Mac run `33189945361`：通过，run number 60；Intel job `98912565820`、Apple Silicon job `98912566111` 均通过类型检查、共享/MacProtection 测试、DMG/ZIP、架构、嵌套签名一致性和 macOS 26 启动存活。
- Mac 构建为 ad-hoc，不是 Developer ID 签名/Apple 公证；该状态不得误报。

## 第一次直传与主动回滚

- Windows delivery run `33190978998`：通过；Mac delivery run `33190985053`：Intel/Apple Silicon 均通过并把版本化对象写入 `quizmate-cn`。
- 首次切换后发现 delivery 标签按设计把包内更新源指向隔离 `temp/<tag>`，不适合正式长期更新；同时 Windows delivery 重建文件与常规 run 39 相差 84 字节，初次清单不得复用 run 39 哈希。
- 在最终验收前主动执行 `rollback-desktop-release-20260829.cjs`，从 `rollback/CHG-20260829-01/` 恢复六个生产可变对象。验证 `suite/latest.yml` 回到 `2026.8.27002`，`mac/latest-mac.yml` 回到 `2026.8.20`，未向用户保留半成品更新推送。
- 修正：新增 `windows-publish-*` / `mac-publish-*` 专用标签。它们保留生产更新源，同时复用签名 PUT 直传；最终清单必须从阿里云最终对象重新计算 SHA-512/size。

