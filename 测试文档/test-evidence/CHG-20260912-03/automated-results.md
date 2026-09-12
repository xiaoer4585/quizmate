# CHG-20260912-03 自动化与浏览器验证

- 时间：2026-09-12（Asia/Shanghai）
- 范围：本地静态 HTTP 预览 `http://127.0.0.1:4173/download.html`；未发布生产。
- 静态语法：`node --check 官网模块/正式官网-quizmate.vip/xiaohongshu-reward.js` 通过；`app.js`、`credits.js` 通过。
- DOM 顺序：下载页页头 `.download-page-hero` 后为 `.xhs-reward-banner`，再为 `.download-grid`，通过。
- 桌面浏览器：1280px 视口下 `body.scrollWidth=1265`，无横向溢出；压缩后页头高度约 229px；活动横幅 top 199px，下载卡片 top 423px，顺序和间距正确。
- 移动浏览器：390px 视口下 `body.scrollWidth=375`，无横向溢出；压缩后页头高度约 229px，活动横幅 top 303px，下载卡片 top 753px；弹窗宽 370px，未超出视口。
- 活动弹窗：标题为“分享网申插件体验，免费领备考包”；20/70 赞收藏奖励档位和提交审核表单均可见；打开/关闭交互通过。
- 图片：`assets/xiaohongshu-career-autofill.jpg` 与 `assets/xiaohongshu-dual-device.jpg` 均 `complete=true`、原图宽 1280px，源路径与用户最后提供的两张无水印图片对应。
- 分享文案：包含“关注小红书官方账号：搜索 quizmate，认准 AI 头像。”和精确句“主页传送门👉 ⓠⓤⓘⓩⓜⓐⓣⓔ点ⓒⓝ”。
- 未登录状态：显示“登录后会自动显示你的专属邀请码，分享时记得带上。”，不展示假邀请码；复制按钮状态显示“分享文案已复制”。
- 控制台：浏览器 `error/warn` 日志为空。
- 充值页回归：`recharge.html` 已移除福利脚本、入口和横幅，活动入口仅保留在下载页。
- 预览截图：已通过浏览器展示桌面下载页首屏与活动弹窗；未执行任何生产发布操作。
