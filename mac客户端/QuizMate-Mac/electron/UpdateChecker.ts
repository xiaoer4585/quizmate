// 客户端版本更新检测管理器
// 基于 electron-updater 实现（项目已配置 generic publish provider: https://quizmate.cn/mac/）
// electron-updater reads latest-mac.yml and selects the matching Mac architecture.
import { app, BrowserWindow, shell } from 'electron';
import { createRequire } from 'module';
import { isNewerVersion } from './version';
const require = createRequire(import.meta.url);
const electronUpdater = require('electron-updater');
const { autoUpdater } = electronUpdater;
import type { UpdateInfo, ProgressInfo } from 'electron-updater';

// 发送给渲染进程的状态载荷（需可序列化）
export interface UpdateStatusPayload {
  // idle: 空闲 / checking: 检测中 / available: 有新版本 / not-available: 已是最新
  // downloading: 下载中 / downloaded: 下载完成 / error: 出错
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;            // 最新版本号（available/downloaded 时有值）
  releaseNotes?: unknown;      // 更新日志
  percent?: number;            // 下载进度 0-100
  transferred?: number;        // 已下载字节数
  total?: number;              // 总字节数
  message?: string;            // 附加信息（如错误描述）
  downloadUrl?: string;        // 当前架构对应的官网 DMG
  currentVersion: string;      // 当前版本号
}

export class UpdateChecker {
  private mainWindow: BrowserWindow | null = null;
  private current: UpdateStatusPayload = { status: 'idle', currentVersion: app.getVersion() };
  private timer: NodeJS.Timeout | null = null;
  private availableVersion: string | null = null;

  constructor() {
    // 当前构建没有 Developer ID 签名，禁止 electron-updater 静默替换应用。
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      this.set({ status: 'checking' });
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      if (!isNewerVersion(info.version, app.getVersion())) {
        this.availableVersion = null;
        this.set({
          status: 'not-available',
          version: undefined,
          downloadUrl: undefined,
          message: undefined,
        });
        return;
      }
      this.availableVersion = info.version;
      this.set({
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes,
        downloadUrl: this.getDownloadUrl(info.version),
        message: '请下载对应芯片版本并覆盖安装',
      });
    });
    autoUpdater.on('update-not-available', () => {
      this.availableVersion = null;
      this.set({ status: 'not-available', version: undefined, downloadUrl: undefined, message: undefined });
    });
    autoUpdater.on('download-progress', (p: ProgressInfo) => {
      this.set({
        status: 'downloading',
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      });
    });
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      // 防御旧缓存或第三方调用：绝不自动退出并安装未正式签名的包。
      this.set({
        status: 'available',
        version: info.version,
        downloadUrl: this.getDownloadUrl(info.version),
        message: '请下载对应芯片版本并覆盖安装',
      });
    });
    autoUpdater.on('error', (err: Error) => {
      const msg = err?.message || String(err);
      // 网络类错误静默忽略，不打扰用户
      if (this.isNetworkError(msg)) {
        this.set({ status: 'idle' });
        return;
      }
      this.set({ status: 'error', message: msg });
    });
  }

  /** 绑定主窗口，用于向渲染进程推送状态 */
  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  /** 获取当前状态 */
  getStatus(): UpdateStatusPayload {
    return this.current;
  }

  /** 检测最新版本（electron-updater 自动按平台/架构读取对应 yml） */
  async checkForUpdates(): Promise<UpdateStatusPayload> {
    // 开发模式下没有 app-update.yml，跳过避免抛错
    if (!app.isPackaged) {
      this.set({ status: 'not-available', message: '开发模式跳过更新检测' });
      return this.current;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.isNetworkError(msg)) {
        this.set({ status: 'idle' });
      } else {
        this.set({ status: 'error', message: msg });
      }
    }
    return this.current;
  }

  /** 在浏览器打开当前架构的官网 DMG，不使用未正式签名的自动替换链路。 */
  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) return;
    const version = this.availableVersion ?? this.current.version;
    if (!version || !isNewerVersion(version, app.getVersion())) {
      this.set({ status: 'not-available', version: undefined, downloadUrl: undefined, message: undefined });
      return;
    }
    try {
      const downloadUrl = this.getDownloadUrl(version);
      await shell.openExternal(downloadUrl);
      this.set({
        status: 'available',
        version,
        downloadUrl,
        message: '安装包已在浏览器中打开，下载后请覆盖安装',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.isNetworkError(msg)) {
        this.set({ status: 'idle' });
      } else {
        this.set({ status: 'error', message: msg });
      }
    }
  }

  /** 兼容旧 IPC：同样打开官网 DMG，不退出客户端。 */
  installUpdate(): void {
    void this.downloadUpdate();
  }

  /** 启动自动检测：启动后 5 秒检测一次，之后每小时检测一次 */
  startAutoCheck(): void {
    setTimeout(() => this.checkForUpdates(), 5_000);
    this.timer = setInterval(() => this.checkForUpdates(), 60 * 60 * 1000);
  }

  /** 停止自动检测 */
  stopAutoCheck(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private set(patch: Partial<UpdateStatusPayload>): void {
    this.current = { ...this.current, ...patch, currentVersion: app.getVersion() };
    this.notify();
  }

  private getDownloadUrl(version: string): string {
    const safeVersion = /^\d+(?:\.\d+)*$/.test(version) ? version : app.getVersion();
    const filename = process.arch === 'arm64'
      ? `QuizMate-Mac-Apple-Silicon-${safeVersion}.dmg`
      : `QuizMate-Mac-Intel-${safeVersion}.dmg`;
    return `https://www.quizmate.cn/downloads/${filename}`;
  }

  /** 判断是否为网络类错误（DNS解析失败、连接超时等），这类错误静默忽略 */
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
      lower.includes('enetunreach') ||
      lower.includes('econnrefused') ||
      lower.includes('etimedout') ||
      lower.includes('getaddrinfo') ||
      lower.includes('network error') ||
      lower.includes('request failed with status code');
  }

  private notify(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update:status', this.current);
    }
  }
}
