export * from '../../../desktop-core/authManager';
import { DesktopAuthManager } from '../../../desktop-core/authManager';
import { ConfigHelper } from './ConfigHelper';

export class AuthManager extends DesktopAuthManager {
  constructor(configHelper: ConfigHelper) {
    super(configHelper, { clientPlatform: 'darwin-desktop', deviceIdPrefix: 'mac' });
  }
}
