// 悬浮窗管理器 - 笔试/面试答案展示，置顶+透明+不可点击+隐身
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { ConfigHelper } from './ConfigHelper';
import { applyAllProtections } from './helpers/protection';

export class OverlayManager {
  private win: BrowserWindow | null = null;
  constructor(private configHelper: ConfigHelper) {}

  async init() {
    const wd = this.configHelper.getAppConfig().windowDefaults;
    const settings = this.configHelper.getClientSettings();
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.win = new BrowserWindow({
      width: wd.overlayWidth,
      height: wd.overlayHeight,
      x: Math.round(width - wd.overlayWidth - 40),
      y: Math.round(height - wd.overlayHeight - 60),
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      focusable: false, // 不可获取焦点，避免切屏检测
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // 让窗口对鼠标穿透（点击穿过到下层笔试平台）
    this.win.setIgnoreMouseEvents(true, { forward: true });

    // 生产/开发加载同一渲染层，通过 hash 区分 overlay 视图
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/overlay');
    } else {
      this.win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'overlay' });
    }

    // 应用 Win32 隐身保护（对屏幕共享/录屏不可见，完全沿用原考试插件）
    applyAllProtections(this.win);
  }

  show() {
    this.win?.showInactive();
  }
  hide() {
    this.win?.hide();
  }
  isVisible() {
    return !!this.win?.isVisible();
  }
  setOpacity(opacity: number) {
    this.win?.setOpacity(opacity);
  }
  /** 推送内容到 overlay 渲染层 */
  render(payload: { type: 'exam' | 'interview'; title?: string; content: string; streaming?: boolean }) {
    this.show();
    this.win?.webContents.send('overlay:render', payload);
  }
  /** 推送面试任务列表到 overlay 渲染层（卡片式 UI） */
  renderTaskList(tasks: Array<{ id: string; question: string; answer?: string; keyPoints?: string[]; error?: string; status: string; ts: number }>) {
    this.show();
    this.win?.webContents.send('overlay:renderTasks', tasks);
  }
  clear() {
    this.win?.webContents.send('overlay:clear');
    this.hide();
  }
  getWin() {
    return this.win;
  }
}
