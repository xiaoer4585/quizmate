// 桌面端共享认证管理器 - 按运行平台注入客户端标识与设备前缀
export * from '../authManager';
import { DesktopAuthManager } from '../authManager';
import { ConfigHelper } from './ConfigHelper';

export class AuthManager extends DesktopAuthManager {
  constructor(configHelper: ConfigHelper) {
    super(configHelper, {
      clientPlatform: process.platform === 'darwin' ? 'darwin-desktop' : 'win32-desktop',
      deviceIdPrefix: process.platform === 'darwin' ? 'mac' : 'win',
    });
  }
}
