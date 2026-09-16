import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { ConfigHelper } from './ConfigHelper';
import { applyAllProtections, startProtectionWatchdog, type ProtectionWatchdog } from './helpers/protection';
import type { TransparentCaptureBounds } from '../shared/mobile-companion';

const BASE_SIZE = 64;
const MIN_SIZE = 32;
const MAX_SIZE = 320;

type StateListener = (state: {
  visible: boolean;
  configuring: boolean;
  scale: number;
  bounds?: TransparentCaptureBounds;
}) => void;

function clampScale(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return Math.min(2, Math.max(0.5, Math.round(numeric * 100) / 100));
}

function safeBounds(bounds: TransparentCaptureBounds | undefined, size: number): TransparentCaptureBounds {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const requested = bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
    ? bounds
    : { x: area.x + area.width - size - 36, y: area.y + Math.round((area.height - size) / 2), width: size, height: size };
  const width = size;
  const height = size;
  const x = Math.min(area.x + Math.max(0, area.width - width), Math.max(area.x, Math.round(requested.x)));
  const y = Math.min(area.y + Math.max(0, area.height - height), Math.max(area.y, Math.round(requested.y)));
  return { x, y, width, height };
}

export class TransparentCaptureOverlayManager {
  private win: BrowserWindow | null = null;
  private watchdog: ProtectionWatchdog | null = null;
  private protectionReady = false;
  private configuring = false;
  private boundsUpdating = false;
  private userVisible = true;

  constructor(
    private readonly config: ConfigHelper,
    private readonly rendererUrl: string,
    private readonly preloadPath: string,
    private readonly onClick: () => void,
    private readonly onState: StateListener,
  ) {
    this.userVisible = this.config.getClientSettings().transparentCaptureEnabled !== false;
  }

  state() {
    const settings = this.config.getClientSettings();
    return {
      visible: !!this.win && !this.win.isDestroyed() && this.win.isVisible(),
      configuring: this.configuring,
      scale: clampScale(settings.transparentCaptureScale),
      bounds: this.getBounds(),
    };
  }

  getBounds(): TransparentCaptureBounds | undefined {
    if (!this.win || this.win.isDestroyed()) {
      const settings = this.config.getClientSettings();
      return settings.transparentCaptureBounds;
    }
    try {
      const bounds = this.win.getBounds();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    } catch {
      return undefined;
    }
  }

  private emitState() {
    this.onState(this.state());
  }

  private sendVisualState() {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) return;
    try { this.win.webContents.send('transparent-capture:visual', { configuring: this.configuring }); } catch {}
  }

  private applyProtection(): boolean {
    if (!this.win || this.win.isDestroyed()) return false;
    try {
      const result = applyAllProtections(this.win);
      this.protectionReady = process.platform !== 'win32'
        ? result.success
        : result.verified === true && result.details?.captureExcluded === true;
      if (!this.protectionReady) this.win.hide();
      return this.protectionReady;
    } catch (error) {
      console.warn('[TransparentCapture] protection failed:', error);
      this.protectionReady = false;
      try { this.win.hide(); } catch {}
      return false;
    }
  }

  private ensureWindow(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const settings = this.config.getClientSettings();
    const scale = clampScale(settings.transparentCaptureScale);
    const size = Math.round(BASE_SIZE * scale);
    const bounds = safeBounds(settings.transparentCaptureBounds, size);
    this.win = new BrowserWindow({
      ...bounds,
      minWidth: MIN_SIZE,
      minHeight: MIN_SIZE,
      maxWidth: MAX_SIZE,
      maxHeight: MAX_SIZE,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      show: false,
      resizable: true,
      movable: true,
      fullscreenable: false,
      paintWhenInitiallyHidden: true,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.win.setTitle(' ');
    this.win.on('page-title-updated', (event) => event.preventDefault());
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true, { forward: true });
    const createdWindow = this.win;
    this.win.on('closed', () => {
      if (this.win !== createdWindow) return;
      this.win = null;
      this.watchdog?.stop();
      this.watchdog = null;
      this.protectionReady = false;
      this.emitState();
    });
    this.win.on('move', () => this.persistBounds());
    this.win.on('resize', () => {
      if (!this.win || this.win.isDestroyed() || this.boundsUpdating) return;
      const bounds = this.win.getBounds();
      const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.max(bounds.width, bounds.height)));
      if (bounds.width !== size || bounds.height !== size) {
        this.boundsUpdating = true;
        try { this.win.setSize(size, size, true); } finally { this.boundsUpdating = false; }
      }
      this.persistBounds();
    });
    this.win.loadURL(this.rendererUrl);
    this.protectionReady = this.applyProtection();
    this.watchdog?.stop();
    this.watchdog = startProtectionWatchdog(this.win, {
      label: 'transparent-capture',
      onProtectionFailure: () => {
        this.protectionReady = false;
        try { this.win?.hide(); } catch {}
        this.emitState();
      },
    });
    this.win.once('ready-to-show', () => {
      this.applyProtection();
      this.sendVisualState();
    });
    return this.win;
  }

  private persistBounds() {
    if (!this.win || this.win.isDestroyed()) return;
    const bounds = this.win.getBounds();
    const persisted = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    this.config.updateClientSettings({ transparentCaptureBounds: persisted });
    this.emitState();
  }

  private showInternal(configuring: boolean): boolean {
    const win = this.ensureWindow();
    if (!win || !this.protectionReady || !this.applyProtection()) return false;
    this.configuring = configuring;
    this.sendVisualState();
    win.setOpacity(1);
    win.setIgnoreMouseEvents(false, { forward: true });
    win.showInactive();
    this.emitState();
    return true;
  }

  show() { return this.showInternal(false); }

  configure() {
    this.userVisible = true;
    this.config.updateClientSettings({ transparentCaptureEnabled: true });
    return this.showInternal(true);
  }

  hide(persist = true) {
    if (persist) {
      this.userVisible = false;
      this.config.updateClientSettings({ transparentCaptureEnabled: false });
    }
    this.configuring = false;
    if (this.win && !this.win.isDestroyed()) {
      try { this.win.setOpacity(0); this.win.hide(); this.win.setIgnoreMouseEvents(true, { forward: true }); } catch {}
    }
    this.sendVisualState();
    this.emitState();
  }

  setVisible(visible: boolean) {
    if (visible) {
      this.userVisible = true;
      this.config.updateClientSettings({ transparentCaptureEnabled: true });
      return this.show();
    }
    this.hide(true);
    return true;
  }

  sync(shouldBeVisible: boolean) {
    if (!shouldBeVisible || !this.userVisible) {
      this.hide(false);
      return;
    }
    if (this.configuring && this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.emitState();
      return;
    }
    this.show();
  }

  temporarilyHide(): boolean {
    const wasVisible = !!this.win && !this.win.isDestroyed() && this.win.isVisible();
    this.hide(false);
    return wasVisible;
  }

  restoreAfterCapture() {
    if (this.userVisible) this.show();
  }

  setScale(value: unknown) {
    const scale = clampScale(value);
    this.config.updateClientSettings({ transparentCaptureScale: scale });
    const size = Math.round(BASE_SIZE * scale);
    const current = this.getBounds() || safeBounds(undefined, size);
    const next = safeBounds({ ...current, width: size, height: size }, size);
    if (this.win && !this.win.isDestroyed()) {
      this.boundsUpdating = true;
      try { this.win.setBounds(next, true); } finally { this.boundsUpdating = false; }
    }
    this.config.updateClientSettings({ transparentCaptureBounds: next });
    this.emitState();
  }

  destroy() {
    this.watchdog?.stop();
    this.watchdog = null;
    const win = this.win;
    this.win = null;
    this.configuring = false;
    this.protectionReady = false;
    if (win && !win.isDestroyed()) {
      try { win.setIgnoreMouseEvents(true, { forward: true }); win.close(); } catch {}
    }
    this.emitState();
  }

  handleClick() {
    if (this.configuring || !this.userVisible) return;
    this.onClick();
  }
}
