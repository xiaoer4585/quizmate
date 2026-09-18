# CHG-20260918-03 发布基线

- 记录时间：2026-09-18（Asia/Shanghai）
- 生产 Git 主线：`b66b6476433d9ed146ab8e96af92e1a4822eea9e`
- 发布分支：`codex/windows-release-20260918`
- 已验收测试提交：`df8526f44c8e08af6c7607bccf25f2f36ed694ca`
- 当前 Windows 更新清单：内部版本 `2026.9.10000`，公开文件 `QuizMate-Windows-2026.09.10.exe`，大小 `82,803,688` 字节。
- 当前生产积分明细请求：`getCreditLedger` 返回 HTTP 400、代码 `UNKNOWN_ACTION`。
- 当前正式官网与 Windows 安装包 URL 均返回 HTTP 200。
- 当前待发布测试包：内部版本 `2026.9.18003`，本地测试包 SHA-256 `A42FBE2BB1850680782FE8B9C16898D15D82961127D38AC8B3FAE2741719D004`，状态 `NotSigned`。
- 发布目标：只更新 Windows、对应 API 和官网 Windows 入口；Mac `latest-mac.yml` 与 Mac 对象保持不变。
