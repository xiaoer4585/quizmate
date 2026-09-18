# CHG-20260918-03 发布执行记录

## 发布前验证

- Windows Node 类型检查：通过。
- Windows Web 类型检查：通过。
- Windows 共享回归：11 个测试文件、83 项测试全部通过。
- Windows production build：通过。
- 后端类型检查：通过。
- 后端全量 Vitest：31 个测试文件、140 项测试全部通过。
- 积分明细、面试和模型专项：4 个测试文件、35 项测试全部通过。
- 后端 production build：通过；`dist/src/actions/accounts.js` 包含 `getCreditLedger`。
- 发布脚本 Node 语法检查与 `git diff --check`：通过。
- 面试积分核对：客户端默认配置、Windows 生产配置和后端计费均为每个成功问题 10 积分。
- 网站映射核对：首页、下载页、操作文档页和考试技巧文章均指向公开版本 `2026.09.18.3`。

## 已知安装依赖情况

Windows `npm ci` 在 Electron 安装脚本阶段长时间无进展后停止；依赖目录完整性经 `npm ls --depth=0` 验证通过，并手工运行项目的 `scripts/link-core-modules.cjs` 建立共享依赖桥。随后 Node/Web 类型检查、83 项共享测试和 production build 全部通过。正式安装包由 GitHub Actions 的干净 Windows 环境使用 `npm ci` 构建，本机依赖状态不作为正式产物来源。

## 生产发布结果

待 GitHub、ECS、OSS 和公网验证完成后填写。
