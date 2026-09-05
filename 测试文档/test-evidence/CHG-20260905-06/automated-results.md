# CHG-20260905-06 自动化结果

- Mac `typecheck:node` / `typecheck:web`：通过。
- Mac `test:shared`：5 个文件、43/43 通过（含 Mac 默认值、迁移、可读文本测试）。
- 代码变更后已重跑：MacProtection、Windows 共享回归；双架构 GitHub Actions 构建待本轮提交后执行。
- 本轮实体 Mac 全局快捷键、截图权限、辅助功能权限、投屏/录屏表现不能由 Windows 或本地 exFAT 环境推断，交付后由用户按 DT-070 复核。

## 最终双架构构建与交付

- 本轮提交后将通过 GitHub Actions 构建 Intel/Apple Silicon 测试包，目标前缀为 `temp/mac-delivery-20260905-shortcut-fix-2/`。
- 测试包采用 ad-hoc 重签，仅用于实机验收；生产 Mac 清单、官网和正式更新通道不改。
- 上一轮 `temp/mac-delivery-20260905-shortcut-fix-1/` 测试对象将在本轮交付验证完成后删除。

## 本轮构建结果（2026-09-05）

- GitHub Actions `33953985141`：Intel/Apple Silicon 均 success；提交 `b36f3e7b0a667321bec665d45759a5c086363684`。
- Intel DMG SHA-256：`a629db5cbd79e9bf41be2953bd75e80383c679ad7022e60b16c4296128867167`；ZIP：`710fecf9bbebcbf8d0b42541f43a87d0498888edd924154e0677182c8186d852`。
- Apple Silicon DMG SHA-256：`9059c3e3d2647eb5ccaf898372ac1a14ed53f416b95eb4ee380aa305e2e13feb`；ZIP：`e672f0a18098bde266f994c9a5c7bb5a272b64d7226373014c7b869612a64a5d`。
- 四个公网对象 HEAD 均 HTTP 200，Range `bytes=0-1023` 均 HTTP 206 且返回 1024 字节；旧 `shortcut-fix-1` 六个对象已删除。
