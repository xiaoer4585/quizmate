# Mac 客户端

当前有效工程：`QuizMate-Mac`
共享桌面公共逻辑位于根目录 `desktop-core`。

## 产品范围

- 笔试助手：截图、AI 识别、答案悬浮展示与语音播报。
- 面试助手：实时语音识别、停顿判题、AI 回答与悬浮展示。
- 免费浏览器插件下载与安装教程。

## 发布架构

- Intel Mac：`x64` DMG。
- Apple 芯片 Mac：`arm64` DMG，适用于 M1、M2、M3、M4 及后续 Apple Silicon。
正式代码不引用历史安装包目录；GitHub 按 `x64` / `arm64` 两条线构建。
