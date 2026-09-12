# CHG-20260912-03 修改前基线

- 时间：2026-09-12（Asia/Shanghai）
- 发布边界：仅本地预览；不得写入 `quizmate-cn` 或 `quizmate-vip`。
- `download.html` SHA-256：`F0274038CE6F4EB37AFA75EF7682D33B31C68FC77F64F8439D01CE7A551B1EC0`
- `recharge.html` SHA-256：`BC54E5FE5BE481C0952DA744EE73AEF9C616A883B2A1C66347CAF0F9B0267A4B`
- `xiaohongshu-reward.js` SHA-256：`6EFF3D3737D9FFAAE021522DDB17A9EA1C332CBA114B506E2D62B6CF347200FA`
- `styles.css` SHA-256：`84DE445CC6E4BD427BAF0548EA5CC98AA35E3F0873F120D4107FEE4E72B49DD1`
- 修改前下载页未加载 `xiaohongshu-reward.js`，也没有 `[data-open-xhs-reward]` 入口。
- 修改前通用 `.page-hero` 使用较大的上下留白和 `42px` 至 `64px` 标题，下载页首屏空间偏大。
- 修改前活动脚本默认使用笔试/面试文案和旧配图；分享内容没有动态展示当前用户邀请码。
- 数据边界：沿用现有 `quizmate_credit_account` 本地登录态与 `getReferralOverview` 只读接口，不新增或迁移数据。
- 回滚：恢复上述四个文件并删除本轮新增的两张活动 JPG。
