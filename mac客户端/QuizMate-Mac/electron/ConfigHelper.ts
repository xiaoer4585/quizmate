export * from '../../../desktop-core/configHelper';
import { DesktopConfigHelper } from '../../../desktop-core/configHelper';

export class ConfigHelper extends DesktopConfigHelper {
  constructor() {
    super({ defaultShortcut: 'Command+Shift+F5' });
  }
}
