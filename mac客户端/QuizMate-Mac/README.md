# QuizMate Mac

QuizMate 的 macOS 客户端，提供笔试助手、面试助手和免费求职插件安装入口。

## 本地验证

```bash
npm ci
npm run typecheck:node
npm run typecheck:web
npm run build
```

## macOS 打包

```bash
# Intel Mac
npm run package:mac:intel

# Apple Silicon
npm run package:mac:apple
```

输出文件：

- `release/QuizMate-Mac-x64-2026.8.12.dmg`
- `release/QuizMate-Mac-arm64-2026.8.12.dmg`

## 首次运行权限

- 面试助手需要“麦克风”权限。
- 笔试截图需要“屏幕录制”权限。
- 应用未使用 Apple Developer ID 签名和公证时，需要在 Finder 中右键应用并选择“打开”。若系统提示“已损坏”，在终端运行 `sudo xattr -rd com.apple.quarantine /Applications/QuizMate.app`，输入开机密码后再次右键打开。
- macOS 的屏幕捕获机制会随系统和会议软件版本变化，正式使用前应在目标共享软件中验证悬浮窗不可见效果。
