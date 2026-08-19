# CHG-20260819-02 验证结果

- 时间：2026-08-19 +08:00
- 本地：`node --check 其他/部署工具/deploy-home-downloads-20260819.cjs` 通过；五个下载包均存在且文件大小大于 0；`git diff --check` 通过。
- 发布：生产 OSS `quizmate-cn`，首页和五个下载对象上传后完成回读哈希校验；线上旧对象已备份到 `rollback/CHG-20260819-02/`。
- 公网首页：`https://quizmate.cn/?download_verify=20260819` 返回 HTTP 200，包含顶部和首屏两个下载菜单，五类下载入口均存在。
- 公网下载检查：Windows、Mac Intel、Mac Apple Silicon、网申插件、Android 五个 URL 均返回 HTTP 200，Content-Length 分别为 87918190、130566589、126920461、664354、96476 字节。
- 未执行：真实 Windows/macOS/Android 安装启动、签名、公证和真机验证；本次只更新官网入口和发布既有安装包，不重新构建客户端。
