# QuizMate Windows 客户端

Windows 客户端源码和构建配置。

## 源码与构建规则

- 本目录是 Windows 客户端的唯一开发源码目录。
- Windows 安装包只通过 GitHub Actions 构建，并从 GitHub Releases 下载。
- 本地不保存、提交或引用安装包；历史构建产物仅存放在 `归档l历史代码正常不需要引用`。
- Android 端和浏览器扩展端保持独立，本客户端只保留网申插件的下载安装入口。

## 本地验证

```bash
npm ci
npm run typecheck:node
npm run typecheck:web
npm run build
```

`out/` 等本地编译输出是临时文件，已加入忽略规则，不属于源码。
