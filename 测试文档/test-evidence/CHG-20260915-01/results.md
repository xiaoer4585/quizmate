# CHG-20260915-01 验证结果

- 分支：`codex/windows-signing-capture-hide-20260913`。
- 发布边界：仅本地 Windows 测试构建；未部署后端、未上传、未上线；Mac 未构建。

## 变更证据

- 后端 `CREDIT_COST_PER_INTERVIEW = 10`，成功面试请求返回 `creditCost: 10` 并写入 `credit_ledger` `-10`。
- Windows/Mac 运行时配置和客户端面试提示同步为 10；双机协作继续复用同一个后端面试动作，不存在第二个扣费常量。
- 官网首页、下载页、`docs.html`、`guide.html`、`recharge.html` 和 LLM 文档均明确“每个完整问题扣 10 积分”，并说明未完成片段/失败/超时不扣费。
- 签名审查只做正规签名链准备和静态检查；未移除悬浮框防截图/录屏/投屏、鼠标穿透或截图恢复逻辑，未加入混淆、加壳、注入和规避检测代码。

## 待执行检查

| 检查 | 状态 |
|---|---|
| 后端面试专项测试（成功扣 10、失败不扣、幂等） | 环境阻塞：后端 node_modules 未安装，`tsc`/`vitest` 不可用 |
| Windows Node/Web 类型检查 | 通过 |
| Windows 共享测试 | 通过，10 个文件 / 74 项 |
| Windows electron-vite 构建与 ia32 安装包审计 | 通过，`PACKAGED_APP_OK version=2026.9.15001 arch=i386` |
| Windows 实机 PC 面试与双机协作余额/流水验证 | 待用户验收 |
| Authenticode 正式签名与 VirusTotal 复测 | 待用户签名后执行 |

## Windows 测试包

- 文件：`windows客户端/QuizMate-Windows/release/CHG-20260915-01/QuizMate-Windows-2026.9.15001.exe`
- 大小：82,805,931 字节
- SHA-256：`A8836C78DD7E334CFB669AE32C07148564AE224796D7D5BC67EE7A6D3C363762`
- Authenticode：`NotSigned`（等待用户使用正式证书签名）
