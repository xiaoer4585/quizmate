# CHG-20260919-03 官网 Windows 支持说明发布结果

- 变更：系统栏为“Windows 11 / 10”；下方说明为“支持 Windows 11 / 10，Windows 11 适配效果最佳，建议升级。”
- 生产目标：`quizmate-cn/download.html` / `https://www.quizmate.cn/download.html`。
- 回滚对象：`rollback/CHG-20260919-03/download.html`。
- 最终 OSS 文件：`20,306` 字节，SHA-256 `48AF2D16D9F4162A8259D3D4C3F2EC6E09C87D1D31E67F323BA6F9B88121EE75`。
- 公网验证：HTTP 200；新文案存在；旧“Win10 及以下不适配”不存在；Windows 公开版本仍为 `2026.09.18.3`，下载对象仍为 `QuizMate-Windows-2026.09.18.3.exe`。
- 异常处置：第一次上传误取旧工作区页面，造成 Windows 版本和下载链接短暂回退；随后使用远端 `main` 最新页面重新发布并加入版本/文件名强校验。最终状态验证通过。
- 发布边界：未触碰 Mac 源码、安装包、清单、链接或页面文案。
