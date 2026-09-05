# CHG-20260905-06 自动化结果

- Mac `typecheck:node` / `typecheck:web`：通过。
- Mac `test:shared`：5 个文件、43/43 通过（含 Mac 默认值、迁移、可读文本测试）。
- 代码变更后已重跑：MacProtection、Windows 共享回归；双架构 GitHub Actions 构建待本轮提交后执行。
- 本轮实体 Mac 全局快捷键、截图权限、辅助功能权限、投屏/录屏表现不能由 Windows 或本地 exFAT 环境推断，交付后由用户按 DT-070 复核。

## 最终双架构构建与交付

- 本轮提交后将通过 GitHub Actions 构建 Intel/Apple Silicon 测试包，目标前缀为 `temp/mac-delivery-20260905-shortcut-fix-2/`。
- 测试包采用 ad-hoc 重签，仅用于实机验收；生产 Mac 清单、官网和正式更新通道不改。
- 上一轮 `temp/mac-delivery-20260905-shortcut-fix-1/` 测试对象将在本轮交付验证完成后删除。
