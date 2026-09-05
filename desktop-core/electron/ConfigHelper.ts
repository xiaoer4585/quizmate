// 桌面端共享配置助手
// 默认快捷键按平台提供可读的 Option/Command 文本；注册时由 ShortcutsHelper
// 将 macOS Option 转成 Electron 的 Alt accelerator。
export * from '../configHelper';
import { DesktopConfigHelper } from '../configHelper';

export class ConfigHelper extends DesktopConfigHelper {
  constructor() {
    super({ defaultShortcut: 'Ctrl+Shift+F5' });
  }
}
