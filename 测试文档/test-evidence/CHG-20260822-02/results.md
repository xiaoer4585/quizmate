# CHG-20260822-02 官网域名收敛与 Mac 更新通道

- 新官网：`quizmate.cn` 与 `www.quizmate.cn` 下载页、Mac 更新清单均 HTTP 200，Mac 版本显示 `2026.8.24`。
- `.vip` 根域名与 `www.quizmate.vip` 首页已改为跳转 `https://www.quizmate.cn/`；`/admin-web/index.html` 保留。
- 删除 DNS：`cpan`、`www.cpan`、`watch`、`crm` 及其验证记录。
- 保留 DNS：`api`（客户端登录/AI 接口）、`kefu`（后台客服）、`update`（旧客户端更新兼容）、`@`/`www`（首页及后台路径）。
- 回滚：OSS 首页备份 `rollback/CHG-20260822-02/index.html`；DNS 删除记录已保留在本次命令输出和变更记录中。
- 实机待验证：旧版 Mac 客户端重启后检查更新、架构匹配下载和覆盖安装。
