# CHG-20260902-01 测试证据

执行时间：2026-09-02（Asia/Shanghai）

## 本地验证

- 后端 `npm run typecheck`：通过。
- 相关回归 `npx vitest run tests/activities.test.ts tests/action-registry.test.ts tests/admin-credit-platform.test.ts tests/model.test.ts`：23/23 通过。
- 后端 `npm run build`：通过。
- 后台内联脚本语法检查：通过（`ADMIN_INLINE_SYNTAX_OK`）。
- 全量 Vitest：136/138 通过；`credit-account-platform.test.ts` 2 项为工作区既有 SQL 断言不匹配，与本次 action 注册修复无关，保留失败证据，不修改测试规避。

## 发布验证

- ECS 部署脚本：通过；服务 `active`，健康接口返回 `status=ok/database=ok`。
- 两个 action 未授权 smoke：均返回 HTTP 403，且未命中 `UNKNOWN_ACTION`。
- ECS 回滚目录：`/opt/quizmate-api-shadow.rollback-admin-menu-actions-20260902-180642`。
- admin-web OSS：`quizmate-vip/admin-web/index.html`、`xiaohongshu-review.js`、`xiaohongshu-review.css` 上传成功；页面 SHA-256 `770d97995aff2d2b62e6cbd815d504c836112d70c08a499e19d498e1b0c6a1e6`；HTML 回滚对象 `rollback/CHG-20260902-01/admin-web.index.before.html`。
- 公网 smoke：`https://www.quizmate.vip/admin-web/index.html`、两个静态资源均 HTTP 200；回读确认小红书菜单、AI 失败菜单及对应 action 标记存在。
- 生产提交：`c7c29d8`，本地标签 `v20260902`。向 Gitee/GitHub 的外部仓库同步因安全审批待授权，未宣称完成。

## 追加官网博客修复（CHG-20260902-02）

- 本地样式检查：通过，`.blog-page` 顶部间距使用 `var(--header-height)`。
- 浏览器验证：生产文章页首屏标题已完整显示在固定导航下方；博客索引与文章正文正常加载。
- 官网发布脚本：`其他/部署工具/deploy-blog-header-offset-20260902.cjs`，目标仅为 `quizmate-cn/styles.css`，发布前备份并回读哈希。
