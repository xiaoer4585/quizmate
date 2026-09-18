import { BrowserWindow, screen } from 'electron';
import { ConfigHelper } from './ConfigHelper';
import { applyAllProtections, startProtectionWatchdog, type ProtectionWatchdog } from './helpers/protection';
import type { TransparentCaptureBounds } from '../shared/mobile-companion';
import { resizeSquareBounds, type TransparentCaptureCorner } from '../shared/transparent-capture-gesture';

const BASE_SIZE = 64;
const MIN_SIZE = 32;
const MAX_SIZE = 320;

type StateListener = (state: {
  visible: boolean;
  configuring: boolean;
  bounds?: TransparentCaptureBounds;
}) => void;

function clampSize(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : BASE_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(numeric)));
}

function safeBounds(bounds: TransparentCaptureBounds | undefined, fallbackSize = BASE_SIZE): TransparentCaptureBounds {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const requested = bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
    ? bounds
    : { x: area.x + area.width - fallbackSize - 36, y: area.y + Math.round((area.height - fallbackSize) / 2), width: fallbackSize, height: fallbackSize };
  const width = clampSize(requested.width || fallbackSize);
  const height = width;
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
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

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
    return {
      visible: !!this.win && !this.win.isDestroyed() && this.win.isVisible(),
      configuring: this.configuring,
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
    const bounds = safeBounds(settings.transparentCaptureBounds);
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
      resizable: false,
      movable: false,
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
      if (this.persistTimer) clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.protectionReady = false;
      this.emitState();
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

  private schedulePersistBounds() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistBounds();
    }, 160);
  }

  private flushPersistBounds() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.persistBounds();
  }

  private showInternal(configuring: boolean): boolean {
    const win = this.ensureWindow();
    if (!win || !this.protectionReady || !this.applyProtection()) return false;
    if (!configuring && this.configuring) this.flushPersistBounds();
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
    if (this.configuring) this.flushPersistBounds();
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

  moveBy(dx: number, dy: number) {
    if (!this.win || this.win.isDestroyed() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const current = this.win.getBounds();
    const next = safeBounds({ ...current, x: current.x + Math.round(dx), y: current.y + Math.round(dy), width: current.width, height: current.height }, current.width);
    this.boundsUpdating = true;
    try { this.win.setPosition(next.x, next.y, true); } finally { this.boundsUpdating = false; }
    this.schedulePersistBounds();
  }

  resizeBy(corner: TransparentCaptureCorner, dx: number, dy: number) {
    if (!this.configuring || !this.win || this.win.isDestroyed() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const current = this.win.getBounds();
    const resized = resizeSquareBounds(current, corner, dx, dy, MIN_SIZE, MAX_SIZE);
    const next = safeBounds(resized, resized.width);
    this.boundsUpdating = true;
    try { this.win.setBounds(next, true); } finally { this.boundsUpdating = false; }
    this.schedulePersistBounds();
  }

  destroy() {
    if (this.win && !this.win.isDestroyed()) this.flushPersistBounds();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
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
