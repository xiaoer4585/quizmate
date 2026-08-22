// 客户端版本更新检测管理器
// 基于 electron-updater 实现（项目已配置 generic publish provider: https://quizmate.cn/mac/）
import { app, BrowserWindow, shell } from 'electron';
import { createRequire } from 'module';
import { isNewerVersion } from './version';
const require = createRequire(import.meta.url);
const electronUpdater = require('electron-updater');
const { autoUpdater } = electronUpdater;
import type { UpdateInfo, ProgressInfo } from 'electron-updater';

export interface UpdateStatusPayload {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: unknown;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
  downloadUrl?: string;
  currentVersion: string;
}
export class UpdateChecker {
  private mainWindow: BrowserWindow | null = null;
  private current: UpdateStatusPayload;
  private timer: NodeJS.Timeout | null = null;
  private availableVersion: string | null = null;

  constructor(
    private getCurrentVersion = () => app.getVersion(),
    private getUpdaterVersion = () => app.getVersion(),
  ) {
    this.current = { status: 'idle', currentVersion: this.getCurrentVersion() };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      if (!isNewerVersion(info.version, this.getUpdaterVersion())) {
        this.availableVersion = null;
        this.set({ status: 'not-available', version: undefined, downloadUrl: undefined, message: undefined });
        return;
      }
      this.availableVersion = info.version;
      const displayVersion = this.toBusinessVersion(info.version);
      this.set({
        status: 'available',
        version: displayVersion,
        releaseNotes: info.releaseNotes,
        downloadUrl: this.getDownloadUrl(displayVersion),
        message: '请下载对应芯片版本并覆盖安装',
      });
    });
    autoUpdater.on('update-not-available', () => {
      this.availableVersion = null;
      this.set({ status: 'not-available', version: undefined, downloadUrl: undefined, message: undefined });
    });
    autoUpdater.on('download-progress', (p: ProgressInfo) => {
      this.set({ status: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total });
    });
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const displayVersion = this.toBusinessVersion(info.version);
      this.set({
        status: 'available',
        version: displayVersion,
        downloadUrl: this.getDownloadUrl(displayVersion),
        message: '请下载对应芯片版本并覆盖安装',
      });
    });
    autoUpdater.on('error', (err: Error) => {
      console.warn('[UpdateChecker] check failed silently:', err?.message || String(err));
      this.set({ status: 'idle', message: undefined });
    });
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  getStatus(): UpdateStatusPayload {
    return this.current;
  }

  async checkForUpdates(): Promise<UpdateStatusPayload> {
    if (!app.isPackaged) {
      this.set({ status: 'not-available', message: '开发模式跳过更新检测' });
      return this.current;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[UpdateChecker] checkForUpdates failed silently:', msg);
      this.set({ status: 'idle', message: undefined });
    }
    return this.current;
  }

  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) return;
    const updaterVersion = this.availableVersion;
    if (!updaterVersion || !isNewerVersion(updaterVersion, this.getUpdaterVersion())) {
      this.set({ status: 'not-available', version: undefined, downloadUrl: undefined, message: undefined });
      return;
    }
    try {
      const version = this.toBusinessVersion(updaterVersion);
      const downloadUrl = this.getDownloadUrl(version);
      await shell.openExternal(downloadUrl);
      this.set({ status: 'available', version, downloadUrl, message: '安装包已在浏览器中打开，下载后请覆盖安装' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.isNetworkError(msg)) this.set({ status: 'idle' });
      else this.set({ status: 'error', message: msg });
    }
  }

  installUpdate(): void {
    void this.downloadUpdate();
  }

  startAutoCheck(): void {
    setTimeout(() => this.checkForUpdates(), 5_000);
    this.timer = setInterval(() => this.checkForUpdates(), 60 * 60 * 1000);
  }

  stopAutoCheck(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private set(patch: Partial<UpdateStatusPayload>): void {
    this.current = { ...this.current, ...patch, currentVersion: this.getCurrentVersion() };
    this.notify();
  }

  private getDownloadUrl(version: string): string {
    const safeVersion = /^\d+(?:\.\d+)*$/.test(version) ? version : this.getCurrentVersion();
    const filename = process.arch === 'arm64'
      ? `QuizMate-Mac-Apple-Silicon-${safeVersion}.dmg`
      : `QuizMate-Mac-Intel-${safeVersion}.dmg`;
    return `https://quizmate.cn/downloads/${filename}`;
  }

  private toBusinessVersion(version: string): string {
    const parts = version.split('.');
    const encodedDay = Number(parts[2]);
    if (parts.length === 3 && Number.isInteger(encodedDay) && encodedDay >= 1000) {
      const day = Math.floor(encodedDay / 1000);
      const revision = encodedDay % 1000;
      return `${parts[0]}.${parts[1]}.${day}.${revision}`;
    }
    return version;
  }

  private isNetworkError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes('err_name_not_resolved') ||
      lower.includes('err_internet_disconnected') ||
      lower.includes('err_connection_refused') ||
      lower.includes('err_connection_timed_out') ||
      lower.includes('err_connection_reset') ||
      lower.includes('err_network_changed') ||
      lower.includes('err_address_unreachable') ||
      lower.includes('err_tunnel_connection_failed') ||
      lower.includes('enetunreach') || lower.includes('econnrefused') ||
      lower.includes('etimedout') || lower.includes('getaddrinfo') ||
      lower.includes('network error') || lower.includes('request failed with status code');
  }

  private notify(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update:status', this.current);
    }
  }
}
