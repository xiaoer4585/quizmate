# QuizMate 官网

这是 QuizMate 的静态官网前端，包含产品介绍、下载、使用指南、FAQ、注册登录和积分充值入口。

## 本地预览

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。

## 目录

- `index.html`：产品首页与联系方式
- `download.html`：Windows、Mac、安卓三个独立客户端及各自完整操作手册下载入口；iPhone 卡片保留在最后并显示正在开发中
- `guide.html`：使用指南
- `faq.html`：常见问题与客服二维码
- `app.js`：导航、设备推荐和官网访问量上报
- `credits.js`：统一账号注册、登录、积分查询和充值
- `admin-web/`：运营管理后台前端
- `assets/`、`downloads/`：图片、视频、客户端和文档资源；每个平台的 PDF 手册独立包含注册登录、下载安装、使用和最后的充值说明

## 后端接口

官网、后台、注册登录和充值统一调用阿里云入口：

`https://api.quizmate.vip/study-auth-api`

CloudBase 代码和旧静态托管配置仅保留作历史回退，不参与生产请求链路。静态官网文件可部署到阿里云 OSS 或其他静态托管服务。

当前公开官网建议统一到 `https://www.quizmate.cn`，`quizmate.cn` 与 `quizmate.vip` 作为跳转入口保留，`https://www.quizmate.vip/admin-web/index.html` 继续保留给后台管理。
