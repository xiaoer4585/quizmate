// 客户端版本更新检测管理器
// 基于 electron-updater 实现（项目已配置 generic publish provider: https://update.quizmate.vip/suite/）
// electron-updater reads latest-mac.yml and selects the matching Mac architecture.
import { app, BrowserWindow } from 'electron';
import { createRequire } from 'module';
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
  currentVersion: string;      // 当前版本号
}

export class UpdateChecker {
  private mainWindow: BrowserWindow | null = null;
  private current: UpdateStatusPayload = { status: 'idle', currentVersion: app.getVersion() };
  private timer: NodeJS.Timeout | null = null;
  private downloaded = false; // 是否已下载完成（避免重复检测/下载）

  constructor() {
    // 手动控制下载与安装，由 UI 触发
    autoUpdater.autoDownload = false;
    // 下载完成后若用户主动退出，则在退出时安装
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.set({ status: 'checking' });
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.set({
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });
    autoUpdater.on('update-not-available', () => {
      this.set({ status: 'not-available' });
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
      this.downloaded = true;
      this.set({ status: 'downloaded', version: info.version });
      // 下载成功后自动关闭客户端并启动安装（留 1.5s 让 UI 展示完成状态）
      setTimeout(() => this.installUpdate(), 1500);
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
    if (this.downloaded) {
      // 已下载完成，无需重复检测
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

  /** 下载更新包（平台对应的安装包由 electron-updater 自动选择） */
  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) return;
    if (this.downloaded) {
      // 已下载则直接安装
      this.installUpdate();
      return;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.isNetworkError(msg)) {
        this.set({ status: 'idle' });
      } else {
        this.set({ status: 'error', message: msg });
      }
    }
  }

  /** 安装更新：关闭应用并启动安装程序 */
  installUpdate(): void {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      this.set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
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
