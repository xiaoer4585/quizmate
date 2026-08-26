// 桌面端共享配置助手
// 默认快捷键两端一致: Windows 上 Alt 即 Alt, macOS 上 Electron 的 Alt 修饰键即 Option 键,
// 因此默认绑定表无需平台差异(仅展示层用 formatAccelerator 按 ⌥/Alt 符号显示)。
export * from '../configHelper';
import { DesktopConfigHelper } from '../configHelper';

export class ConfigHelper extends DesktopConfigHelper {
  constructor() {
    super({ defaultShortcut: 'Ctrl+Shift+F5' });
  }
}
