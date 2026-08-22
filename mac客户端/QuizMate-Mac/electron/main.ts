// QuizMate考试助手 - 主进程入口
// Mac 客户端复用 QuizMate 当前稳定的笔试与面试业务逻辑。
//   - Mac 全局快捷键系统（Command 组合键）
//   - 截图→压缩→OSS/直传→AI 分析→悬浮窗展示/TTS 播报 完整流程
//   - overlay/voice 双模式切换
//   - 防捕获保护（WDA_EXCLUDEFROMCAPTURE + WS_EX_TOOLWINDOW + 空标题）
//   - 托盘忙碌图标 + voice 模式进度通知
// Mac 客户端只保留笔试助手与面试助手；求职流程由免费浏览器插件提供。
import { app, BrowserWindow, screen, shell, globalShortcut, ipcMain, nativeImage, session, systemPreferences, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { ConfigHelper } from './ConfigHelper';
import { AuthManager } from './AuthManager';
import { TrayManager } from './TrayManager';
import { registerIpcHandlers } from './ipcHandlers';
import { ScreenshotHelper } from './helpers/ScreenshotHelper';
import { LightweightProcessingHelper } from './helpers/ProcessingHelper';
import { ShortcutsHelper } from './ShortcutsHelper';
import { TtsHelper } from './helpers/TtsHelper';
import { ByteDanceTtsHelper } from './helpers/ByteDanceTtsHelper';
import { RealtimeVoiceHelper } from './helpers/RealtimeVoiceHelper';
import { applyAllProtections, applyAntiCapture, ProtectionResult } from './helpers/MacProtection';
import { InterviewHelper } from './helpers/InterviewHelper';
import { OverlayManager } from './OverlayManager';
import { UpdateChecker } from './UpdateChecker';
import { ShortcutAction, ProcessingMode } from '../shared/shortcuts';

// ===== 应用状态（沿用原考试插件 state 结构） =====
interface AppState {
  mainWindow: BrowserWindow | null;       // 主窗口（配置/控制台，等同于原考试的 configWindow）
  overlayWindow: BrowserWindow | null;     // 笔试悬浮窗（加载 /overlay-exam 路由，原考试插件 UI）
  interviewOverlayWindow: BrowserWindow | null; // 面试悬浮窗（加载 /overlay-interview 路由，面试任务卡片 UI）
  isOverlayVisible: boolean;
  overlayLocked: boolean;                  // 笔试悬浮框是否已启动（考试客户端生命周期）
  interviewOverlayActive: boolean;         // 面试悬浮框是否已启动
  interviewOverlayVisible: boolean;        // 面试悬浮框当前是否可见
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  step: number;                            // 窗口移动步长
  currentX: number;
  currentY: number;
  quitting: boolean;
  skipRestoreOnClose: boolean;             // 关闭悬浮框时不注销快捷键（Command+B 保持可用）
  currentTheme: 'dark' | 'light';
  zoomFactor: number;
  lastVoiceAnswer: string;                 // 上次语音播报的答案，用于重听
}

const state: AppState = {
  mainWindow: null,
  overlayWindow: null,
  interviewOverlayWindow: null,
  isOverlayVisible: false,
  overlayLocked: false,
  interviewOverlayActive: false,
  interviewOverlayVisible: false,
  windowPosition: null,
  windowSize: null,
  screenWidth: 0,
  screenHeight: 0,
  step: 60,
  currentX: 0,
  currentY: 50,
  quitting: false,
  skipRestoreOnClose: false,
  currentTheme: 'dark',
  zoomFactor: 1.0,
  lastVoiceAnswer: '',
};

// Helper 实例
const configHelper = new ConfigHelper();
let authManager: AuthManager;
let screenshotHelper: ScreenshotHelper;
let shortcutsHelper: ShortcutsHelper;
let processingHelper: LightweightProcessingHelper;
let ttsHelper: TtsHelper;
let byteDanceTtsHelper: ByteDanceTtsHelper;
let realtimeVoiceHelper: RealtimeVoiceHelper;
let interviewHelper: InterviewHelper;
let updateChecker: UpdateChecker;
let trayManager: TrayManager | null = null;

// 共享上下文
export const ctx = {
  configHelper,
  authManager: null as AuthManager | null,
  screenshot: null as ScreenshotHelper | null,
  processing: null as LightweightProcessingHelper | null,
  shortcuts: null as ShortcutsHelper | null,
  tts: null as TtsHelper | null,
  interview: null as InterviewHelper | null,
  updateChecker: null as UpdateChecker | null,
};

// ===== 工具函数 =====
function getAssetPath(...segments: string[]) {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, ...segments);
}

function getAppIconPath(): string | undefined {
  const iconPath = getAssetPath('resources', 'icon.png');
  if (fs.existsSync(iconPath)) return iconPath;
  return undefined;
}

// Generate a fallback Q icon when the packaged PNG is unavailable.
function getGeneratedIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="48" fill="#2268df"/><text x="128" y="185" font-family="Arial,sans-serif" font-size="180" font-weight="bold" fill="white" text-anchor="middle">Q</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

async function configureMacPermissions(): Promise<void> {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    if (permission !== 'media') return false;
    return !details.mediaType || details.mediaType === 'audio';
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }
    const mediaTypes = 'mediaTypes' in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    callback(mediaTypes.length === 0 || (mediaTypes.includes('audio') && !mediaTypes.includes('video')));
  });

  const iconPath = getAppIconPath();
  if (iconPath && app.dock) app.dock.setIcon(iconPath);

  try {
    await systemPreferences.askForMediaAccess('microphone');
  } catch (error) {
    console.warn('[Main] Microphone permission request failed:', error);
  }
}

function getPreloadPath() {
  return path.join(__dirname, '../preload/index.cjs');
}

function getRendererUrl(hash?: string) {
  if (process.env['ELECTRON_RENDERER_URL']) {
    const suffix = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
    return `${process.env['ELECTRON_RENDERER_URL']}${suffix}`;
  }
  const indexPath = path.join(__dirname, '../renderer/index.html');
  const fileUrl = pathToFileURL(indexPath).toString();
  return hash ? `${fileUrl}${hash.startsWith('#') ? hash : `#${hash}`}` : fileUrl;
}

// ===== 嵌入式窗口（充值/注册） =====
function openEmbeddedWindow(kind: 'recharge' | 'register') {
  if (kind === 'recharge') {
    const cfg = configHelper.getAppConfig();
    const url = cfg.rechargeUrl || 'https://quizmate.cn/recharge.html';
    const rechargeOrigin = new URL(url).origin;
    const rechargeWin = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      title: '充值积分',
      autoHideMenuBar: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'quizmate-recharge',
      },
    });
    const token = configHelper.getAuthToken();
    rechargeWin.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = { ...details.requestHeaders };
      if (new URL(details.url).origin === rechargeOrigin) {
        if (token) headers['X-Account-Token'] = token;
        headers['X-Client-Version'] = app.getVersion();
        headers['X-Client-Platform'] = 'darwin-desktop';
      }
      cb({ requestHeaders: headers });
    });
    rechargeWin.loadURL(url);
    return;
  }
  const cfg = configHelper.getAppConfig();
  const url = cfg.registerUrl;
  if (!url) return;
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: '注册账号',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 注入 token 让官网自动登录
  const token = configHelper.getAuthToken();
  win.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = { ...details.requestHeaders };
    if (token) headers['X-Account-Token'] = token;
    headers['X-Client-Version'] = app.getVersion();
    headers['X-Client-Platform'] = 'darwin-desktop';
    cb({ requestHeaders: headers });
  });
  win.loadURL(url);
}

// ===== 主窗口（配置/控制台，等同于原考试的 configWindow） =====
function createMainWindow() {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.focus();
    return;
  }
  const wd = configHelper.getAppConfig().windowDefaults;
  state.mainWindow = new BrowserWindow({
    width: wd.configWidth,
    height: wd.configHeight,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'QuizMate',
    icon: getAppIconPath() || getGeneratedIcon(),
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  state.mainWindow.on('ready-to-show', () => state.mainWindow?.show());
  // 窗口获得焦点时从后端刷新积分，保证多端实时同步
  state.mainWindow.on('focus', () => refreshCreditsFromServer());
  // 同步更新检测器的主窗口引用，用于推送更新状态
  updateChecker?.setMainWindow(state.mainWindow);

  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowed = configHelper.getAppConfig().allowedExternalHosts;
    try {
      if (allowed.some((h) => new URL(url).hostname.endsWith(h))) {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  const url = getRendererUrl();
  if (url) state.mainWindow.loadURL(url);
  if (!app.isPackaged) state.mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ===== 悬浮窗（透明、置顶、防捕获）完全沿用原考试插件 =====
function createOverlayWindow() {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    showOverlay();
    return;
  }
  const wd = configHelper.getAppConfig().windowDefaults;
  const savedSize = configHelper.getWindowSize();
  const savedPos = configHelper.getWindowPosition();
  const width = savedSize?.width || wd.overlayWidth;
  const height = savedSize?.height || wd.overlayHeight;

  state.overlayWindow = new BrowserWindow({
    width,
    height,
    minWidth: 200,
    minHeight: 40,
    x: savedPos?.x ?? 50,
    y: savedPos?.y ?? 50,
    alwaysOnTop: true,
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 1.0,
    backgroundColor: '#00000000',
    focusable: false,
    skipTaskbar: true,
    type: 'panel',
    resizable: true,
    paintWhenInitiallyHidden: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    enableLargerThanScreen: true,
    movable: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      scrollBounce: true,
    },
  });

  state.overlayWindow.setTitle(' ');
  state.overlayWindow.on('page-title-updated', (e) => e.preventDefault());

  // ===== 防捕获 / 防检测保护（完全沿用原考试插件） =====
  const applyProtection = () => {
    if (!state.overlayWindow || state.overlayWindow.isDestroyed()) return;
    try {
      const result: ProtectionResult = applyAllProtections(state.overlayWindow);
      console.log('[Main] Overlay protection applied:', JSON.stringify(result));
    } catch (e) {
      console.warn('[Main] Protection failed:', e);
    }
  };
  applyProtection();
  state.overlayWindow.once('ready-to-show', applyProtection);
  state.overlayWindow.once('show', applyProtection);
  setTimeout(applyProtection, 200);
  setTimeout(applyProtection, 1000);

  state.overlayWindow.webContents.on('did-finish-load', () => {
    state.overlayWindow?.webContents.send('background-opacity-changed', configHelper.getBackgroundOpacity());
    state.overlayWindow?.webContents.send('client-theme-changed', state.currentTheme);
    state.overlayWindow?.webContents.setZoomFactor(state.zoomFactor);
  });

  state.overlayWindow.on('move', () => {
    if (!state.overlayWindow) return;
    const b = state.overlayWindow.getBounds();
    state.windowPosition = { x: b.x, y: b.y };
    state.currentX = b.x;
    state.currentY = b.y;
    configHelper.setWindowPosition({ x: b.x, y: b.y });
  });

  state.overlayWindow.on('resize', () => {
    if (!state.overlayWindow) return;
    const b = state.overlayWindow.getBounds();
    state.windowSize = { width: b.width, height: b.height };
    configHelper.setWindowSize({ width: b.width, height: b.height });
    state.overlayWindow.webContents.send('window-resized', { width: b.width, height: b.height });
  });

  state.overlayWindow.on('closed', () => {
    state.overlayWindow = null;
    state.isOverlayVisible = false;
    state.overlayLocked = false;
  });

  const overlayUrl = getRendererUrl('#/overlay-exam');
  if (overlayUrl) state.overlayWindow.loadURL(overlayUrl);

  state.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  state.overlayWindow.setSkipTaskbar(false);
  // 窗口创建后立即设置鼠标穿透（核心：永不关闭）
  state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // 等页面加载完成后再显示，避免黑屏（loadURL 是异步的）
  state.overlayWindow.once('ready-to-show', () => {
    state.overlayWindow?.show();
    state.overlayWindow?.showInactive();
    state.overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
    state.isOverlayVisible = true;
    state.overlayLocked = true;
  });
  // 兜底：如果 ready-to-show 在 3 秒内没触发，强制显示
  setTimeout(() => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed() && !state.isOverlayVisible) {
      state.overlayWindow.show();
      state.overlayWindow.showInactive();
      state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      state.isOverlayVisible = true;
      state.overlayLocked = true;
    }
  }, 3000);

  // 同步 processingHelper 的窗口引用
  processingHelper.setMainWindow(state.overlayWindow);
}

function showOverlay() {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    state.overlayWindow.showInactive();
    state.overlayWindow.setOpacity(1.0);
    // 始终保持鼠标穿透，仅通过快捷键操作
    state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isOverlayVisible = true;
    // 重新应用防捕获保护: 窗口隐藏/显示后, display affinity 可能被重置
    try { applyAntiCapture(state.overlayWindow); } catch (e) {
      console.warn('[Main] Re-apply anti-capture on show failed:', e);
    }
  }
}

function hideOverlay() {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    // 完全隐藏窗口，确保截图时不可见
    state.overlayWindow.setOpacity(0);
    state.overlayWindow.hide();
    state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isOverlayVisible = false;
  }
}

function toggleOverlay() {
  if (state.isOverlayVisible) hideOverlay();
  else showOverlay();
}

function moveOverlay(dx: number, dy: number) {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    const [x, y] = state.overlayWindow.getPosition();
    state.overlayWindow.setPosition(x + dx, y + dy, true);
  }
}

function resizeOverlay(dw: number, dh: number) {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    const [w, h] = state.overlayWindow.getSize();
    state.overlayWindow.setSize(Math.max(200, w + dw), Math.max(40, h + dh), true);
  }
}

function setWindowBounds(bounds: { x: number; y: number; width: number; height: number }) {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    state.overlayWindow.setBounds(bounds, true);
  }
}

function getWindowBounds(): { x: number; y: number; width: number; height: number } | null {
  if (!state.overlayWindow || state.overlayWindow.isDestroyed()) return null;
  const b = state.overlayWindow.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function resetWindowPosition() {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    const [w, h] = state.overlayWindow.getSize();
    state.overlayWindow.setPosition(Math.floor((width - w) / 2), Math.floor((height - h) / 2), true);
  }
}

function setBackgroundOpacity(opacity: number) {
  const clamped = Math.max(0.1, Math.min(1.0, opacity));
  configHelper.setBackgroundOpacity(clamped);
  state.overlayWindow?.webContents.send('background-opacity-changed', clamped);
  state.interviewOverlayWindow?.webContents.send('background-opacity-changed', clamped);
}

function setZoomFactor(factor: number) {
  state.zoomFactor = Math.max(0.5, Math.min(2.0, factor));
  configHelper.updateClientSettings({ zoomFactor: state.zoomFactor });
  [state.mainWindow, state.overlayWindow, state.interviewOverlayWindow].forEach((w) => {
    if (w && !w.isDestroyed()) w.webContents.setZoomFactor(state.zoomFactor);
  });
}

function broadcastTheme(theme: 'dark' | 'light') {
  [state.mainWindow, state.overlayWindow, state.interviewOverlayWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('client-theme-changed', theme);
    }
  });
}

function setTheme(theme: 'dark' | 'light') {
  configHelper.setTheme(theme);
  state.currentTheme = theme;
  broadcastTheme(theme);
}

function setIgnoreMouseEvents(ignore: boolean) {
  // 悬浮窗默认鼠标穿透，接收 ignore=false 时临时解除以便悬浮窗内的按钮接收点击
  // （如 OverlayActionButton 兜底按钮的 hover/click）。主进程在窗口隐藏/截图等流程
  // 末尾会重新恢复 true，避免悬浮窗干扰下方应用。
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    if (ignore) state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    else state.overlayWindow.setIgnoreMouseEvents(false);
  }
}

function minimizeWindow(which: 'main' | 'overlay') {
  const win = which === 'main' ? state.mainWindow : state.overlayWindow;
  win?.minimize();
}

function maximizeWindow(which: 'main' | 'overlay') {
  const win = which === 'main' ? state.mainWindow : state.overlayWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
}

function closeWindow(which: 'main' | 'overlay') {
  const win = which === 'main' ? state.mainWindow : state.overlayWindow;
  win?.close();
}

// ===== 启动/关闭考试客户端（悬浮框生命周期管理，完全沿用原考试插件） =====
async function launchExamClient(): Promise<{ success: boolean; error?: string }> {
  if (state.overlayLocked) {
    // 悬浮框已存在, 只需显示它
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      showOverlay();
    }
    return { success: true };
  }
  state.overlayLocked = true;
  // 快捷键已在启动时注册, 无需重复注册
  await Promise.resolve(createOverlayWindow());
  return { success: true };
}

async function closeExamClient(): Promise<void> {
  state.skipRestoreOnClose = true;
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    state.overlayWindow.close();
  }
  state.overlayLocked = false;
}

// ===== 快捷键测试模式 =====
function startShortcutTest() {
  shortcutsHelper?.startShortcutTest((accelerator) => {
    const win = state.mainWindow || state.overlayWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('shortcut-test-result', { accelerator, success: true });
    }
  });
}

function cancelShortcutTest() {
  shortcutsHelper?.cancelShortcutTest();
}

// ===== 快捷键处理（完全沿用原考试插件 handleShortcutAction） =====
// 面试悬浮窗激活时，移动/缩放/显示隐藏/重听快捷键路由到面试悬浮窗
async function handleShortcutAction(action: ShortcutAction): Promise<void> {
  const interviewActive = state.interviewOverlayActive;
  switch (action) {
    case 'screenshot':
      // 面试没有截图功能
      if (interviewActive) return;
      await handleScreenshot(false);
      break;
    case 'search':
      // 面试没有搜题功能
      if (interviewActive) return;
      await handleSearchAction(configHelper.getProcessingMode());
      break;
    case 'replay':
      if (interviewActive) {
        // 面试模式：重听上一个答案
        interviewHelper?.replayLastAnswer?.();
      } else {
        await handleReplayAction();
      }
      break;
    case 'quit':
      state.quitting = true;
      app.quit();
      break;
    case 'reset':
      if (interviewActive) {
        // 面试模式：清空任务列表
        interviewHelper?.clearTasks?.();
      } else {
        await handleReset();
      }
      break;
    case 'toggle_visibility':
      if (interviewActive) {
        // 面试悬浮窗：Command+B 切换显示/隐藏
        if (!state.interviewOverlayWindow || state.interviewOverlayWindow.isDestroyed()) {
          createInterviewOverlayWindow();
        } else {
          toggleInterviewOverlay();
        }
      } else {
        // 笔试悬浮窗：voice 模式不应触发此快捷键
        if (configHelper.getProcessingMode() === 'voice') return;
        if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
          await launchExamClient();
        } else {
          toggleOverlay();
        }
      }
      break;
    case 'interview_start':
      if (!state.interviewOverlayWindow || state.interviewOverlayWindow.isDestroyed()) {
        createInterviewOverlayWindow();
      }
      if (interviewHelper?.isListening()) interviewHelper.stop();
      else await interviewHelper?.start();
      break;
    case 'interview_prev_question':
      state.interviewOverlayWindow?.webContents.send('interview:navigate', { direction: 'prev' });
      break;
    case 'interview_next_question':
      state.interviewOverlayWindow?.webContents.send('interview:navigate', { direction: 'next' });
      break;
    case 'move_up':    interviewActive ? moveInterviewOverlay(0, -state.step) : moveOverlay(0, -state.step); break;
    case 'move_down':  interviewActive ? moveInterviewOverlay(0, state.step)  : moveOverlay(0, state.step); break;
    case 'move_left':  interviewActive ? moveInterviewOverlay(-state.step, 0) : moveOverlay(-state.step, 0); break;
    case 'move_right': interviewActive ? moveInterviewOverlay(state.step, 0)  : moveOverlay(state.step, 0); break;
    case 'resize_width_smaller':   interviewActive ? resizeInterviewOverlay(-20, 0) : resizeOverlay(-20, 0); break;
    case 'resize_width_larger':    interviewActive ? resizeInterviewOverlay(20, 0)  : resizeOverlay(20, 0); break;
    case 'resize_height_smaller':  interviewActive ? resizeInterviewOverlay(0, -20) : resizeOverlay(0, -20); break;
    case 'resize_height_larger':   interviewActive ? resizeInterviewOverlay(0, 20)  : resizeOverlay(0, 20); break;
    case 'opacity_brighter':
    case 'opacity_brighter_alt':
      setBackgroundOpacity(configHelper.getBackgroundOpacity() + 0.1);
      break;
    case 'opacity_darker':
    case 'opacity_darker_alt':
      setBackgroundOpacity(configHelper.getBackgroundOpacity() - 0.1);
      break;
    case 'zoom_out': setZoomFactor(state.zoomFactor - 0.1); break;
    case 'zoom_reset': setZoomFactor(1.0); break;
    case 'zoom_in': setZoomFactor(state.zoomFactor + 0.1); break;
    case 'toggle_raw_output':
      if (interviewActive) {
        state.interviewOverlayWindow?.webContents.send('toggle-raw-output');
      } else {
        state.overlayWindow?.webContents.send('toggle-raw-output');
      }
      break;
    case 'copy_content':
      if (interviewActive) {
        state.interviewOverlayWindow?.webContents.send('copy-content');
      } else {
        state.overlayWindow?.webContents.send('copy-content');
      }
      break;
    case 'delete_latest_screenshot':
      if (interviewActive) return; // 面试无截图
      screenshotHelper.deleteLatest(false);
      state.overlayWindow?.webContents.send('screenshot-deleted', { isExtra: false });
      break;
    case 'reset_position':
      interviewActive ? resetInterviewOverlayPosition() : resetWindowPosition();
      break;
    case 'refresh_config':
      state.overlayWindow?.webContents.send('refresh-config');
      state.interviewOverlayWindow?.webContents.send('refresh-config');
      state.mainWindow?.webContents.send('refresh-config');
      break;
    default:
      console.warn('[Main] Unknown shortcut action:', action);
  }
}

// ===== 截图→分析编排（完全沿用原考试插件流程） =====
function sendClientEvent(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function handleScreenshot(isExtra: boolean): Promise<boolean> {
  const appConfig = configHelper.getAppConfig();
  const procMode = configHelper.getProcessingMode();
  const wasVisible = state.isOverlayVisible;
  sendClientEvent('screenshot-start', { isExtra });

  // overlay 模式：截图前完全隐藏悬浮窗，确保截图无轮廓
  if (procMode === 'overlay' && wasVisible) {
    hideOverlay();
    await new Promise((r) => setTimeout(r, Math.max(appConfig.screenshotHideDelayMs, 500)));
  }
  try {
    const result = await screenshotHelper.captureFullScreen();
    if (result.success && result.filePath) {
      const saved = await screenshotHelper.saveToQueue(result.filePath, isExtra);
      if (!saved) {
        sendClientEvent('screenshot-error', { error: '截图已获取，但保存失败，请检查磁盘空间后重试。', code: 'SCREENSHOT_SAVE_FAILED', stage: 'save' });
        return false;
      }
      const base64 = await screenshotHelper.fileToBase64(saved);
      if (!base64) {
        sendClientEvent('screenshot-error', { error: '截图已保存，但读取失败，请重新截图。', code: 'SCREENSHOT_READ_FAILED', stage: 'read' });
        return false;
      }
      sendClientEvent('screenshot-added', { path: saved, base64, isExtra });
      return true;
    }
    sendClientEvent('screenshot-error', { error: result.error || '截图失败，请重新授权后重试。', code: 'SCREENSHOT_CAPTURE_FAILED', stage: 'capture' });
    return false;
  } catch (error: any) {
    sendClientEvent('screenshot-error', { error: error?.message || '截图失败，请重试。', code: 'SCREENSHOT_UNEXPECTED_ERROR', stage: 'capture' });
    return false;
  } finally {
    if (procMode === 'overlay' && wasVisible) {
      await new Promise((r) => setTimeout(r, appConfig.screenshotRestoreDelayMs));
      showOverlay();
    }
  }
}

async function handleSearchAction(mode: ProcessingMode): Promise<void> {
  const procMode = configHelper.getProcessingMode();
  let queue = screenshotHelper.getQueue(false);

  // voice 模式：队列为空时自动截图（一体化流程：快捷键触发截图 + 搜题 + 播报）
  if (procMode === 'voice' && queue.length === 0) {
    notifyVoiceProgress('正在截图...');
    setTrayBusy(true);
    const captured = await handleScreenshot(false);
    if (!captured) {
      setTrayBusy(false);
      return;
    }
    queue = screenshotHelper.getQueue(false);
  }

  if (queue.length === 0) {
    const errMsg = '请先截图';
    if (procMode === 'voice') {
      ttsHelper?.cancel();
      ttsHelper?.speak(errMsg).catch(() => {});
    } else {
      state.overlayWindow?.webContents.send('processing-no-screenshots', { error: errMsg });
    }
    setTrayBusy(false);
    return;
  }

  // 只取最新一张截图发给 AI
  const latestShot = queue[queue.length - 1];
  const b64 = await screenshotHelper.fileToCompressedBase64(latestShot);
  if (!b64) {
    const errMsg = '截图读取失败';
    if (procMode === 'voice') {
      ttsHelper?.cancel();
      ttsHelper?.speak(errMsg).catch(() => {});
    } else {
      state.overlayWindow?.webContents.send('processing-no-screenshots', { error: errMsg });
    }
    setTrayBusy(false);
    return;
  }

  // 进度通知 + 托盘忙碌图标
  notifyVoiceProgress('正在调用 AI 分析...');
  setTrayBusy(true);

  // 直接调用 analyze 获取完整结果
  const result = await processingHelper.analyze({ images: [b64], mode });

  // 失败时保留原截图，用户可直接重试；仅成功后清空队列。
  if (result.success) {
    screenshotHelper.clearAll();
    sendClientEvent('screenshots-cleared', undefined);
  }

  if (procMode === 'voice') {
    // voice 模式：不依赖悬浮框事件，改用 TTS 播报
    const tts = ttsHelper;
    if (!tts) { setTrayBusy(false); return; }
    tts.cancel();
    if (result.success && result.answer) {
      // 保存答案用于重听快捷键
      state.lastVoiceAnswer = result.answer;
      notifyVoiceProgress('正在播报答案...');
      const speakResult = await tts.speak(result.answer);
      if (!speakResult.success) {
        state.mainWindow?.webContents.send('solution-stream-error', { error: speakResult.error });
      }
    } else if (!result.success) {
      const speakResult = await tts.speak(result.error || '分析失败');
      if (!speakResult.success) {
        state.mainWindow?.webContents.send('solution-stream-error', { error: speakResult.error });
      }
    }
    notifyVoiceProgress(null);
  }
  // overlay 模式：analyze() 已通过 sendEvent 将结果发送给悬浮框
  setTrayBusy(false);
}

/** voice 模式进度通知：向主窗口发送进度状态（null 表示清除） */
function notifyVoiceProgress(message: string | null): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('voice-progress', { message });
  }
}

/** 设置托盘忙碌状态（AI 处理中时图标变化，本地用户可见但远程不易察觉） */
function setTrayBusy(busy: boolean): void {
  trayManager?.setBusy(busy);
}

/** 重听上次答案（voice 模式专用，按 replay 快捷键触发） */
async function handleReplayAction(): Promise<void> {
  const procMode = configHelper.getProcessingMode();
  if (procMode !== 'voice') return;
  const tts = ttsHelper;
  if (!tts) return;
  if (!state.lastVoiceAnswer) {
    tts.cancel();
    await tts.speak('暂无可重听的答案').catch(() => {});
    return;
  }
  tts.cancel();
  notifyVoiceProgress('正在重听答案...');
  const speakResult = await tts.speak(state.lastVoiceAnswer);
  if (!speakResult.success) {
    state.mainWindow?.webContents.send('solution-stream-error', { error: speakResult.error });
  }
  notifyVoiceProgress(null);
}

async function handleReset(): Promise<void> {
  processingHelper.cancelStreaming();
  screenshotHelper.clearAll();
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    state.overlayWindow.webContents.send('reset-complete');
  }
}

// ===== 处理模式切换（overlay/voice，完全沿用原考试插件） =====
async function switchProcessingMode(mode: 'overlay' | 'voice'): Promise<void> {
  configHelper.setProcessingMode(mode);
  if (mode === 'voice') {
    // 切到 voice 模式：如果悬浮框存在则销毁，重新注册快捷键（仅 voice 白名单）
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      await closeExamClient();
    }
    shortcutsHelper?.registerGlobalShortcutsForMode('voice');
  } else {
    // 切到 overlay 模式：恢复所有快捷键，不自动启动悬浮框（等用户按 Command+B）
    shortcutsHelper?.registerGlobalShortcutsForMode('overlay');
  }
  // 向所有渲染进程发送模式切换事件
  [state.mainWindow, state.overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('processing-mode-changed', { mode });
    }
  });
}

// ===== 面试悬浮窗（独立 BrowserWindow，加载 /overlay-interview 路由） =====
// 参考 Cuemate 方式：透明悬浮窗 + 快捷键控制，完全沿用笔试悬浮窗的透明穿透方案
function createInterviewOverlayWindow() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    showInterviewOverlay();
    return;
  }
  const wd = configHelper.getAppConfig().windowDefaults;
  const savedSize = configHelper.getWindowSize();
  const savedPos = configHelper.getWindowPosition();
  const width = savedSize?.width || wd.overlayWidth;
  const height = savedSize?.height || wd.overlayHeight;

  state.interviewOverlayWindow = new BrowserWindow({
    width,
    height,
    minWidth: 200,
    minHeight: 40,
    x: savedPos?.x ?? 50,
    y: savedPos?.y ?? 50,
    alwaysOnTop: true,
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 1.0,
    backgroundColor: '#00000000',
    focusable: false,           // 鼠标穿透：不可获取焦点
    skipTaskbar: true,
    type: 'panel',
    resizable: true,
    paintWhenInitiallyHidden: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    enableLargerThanScreen: true,
    movable: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      scrollBounce: true,
    },
  });

  state.interviewOverlayWindow.setTitle(' ');
  state.interviewOverlayWindow.on('page-title-updated', (e) => e.preventDefault());

  // 防捕获保护（与笔试悬浮窗一致）
  const applyInterviewProtection = () => {
    if (!state.interviewOverlayWindow || state.interviewOverlayWindow.isDestroyed()) return;
    try {
      const result: ProtectionResult = applyAllProtections(state.interviewOverlayWindow);
      console.log('[Main] Interview overlay protection applied:', JSON.stringify(result));
    } catch (e) { console.warn('[Main] Interview overlay protection failed:', e); }
  };
  applyInterviewProtection();
  state.interviewOverlayWindow.once('ready-to-show', applyInterviewProtection);
  state.interviewOverlayWindow.once('show', applyInterviewProtection);
  setTimeout(applyInterviewProtection, 200);
  setTimeout(applyInterviewProtection, 1000);

  state.interviewOverlayWindow.webContents.on('did-finish-load', () => {
    state.interviewOverlayWindow?.webContents.send('background-opacity-changed', configHelper.getBackgroundOpacity());
    state.interviewOverlayWindow?.webContents.send('client-theme-changed', state.currentTheme);
    state.interviewOverlayWindow?.webContents.setZoomFactor(state.zoomFactor);
  });

  state.interviewOverlayWindow.on('closed', () => {
    state.interviewOverlayWindow = null;
    state.interviewOverlayActive = false;
    state.interviewOverlayVisible = false;
  });

  // 与笔试悬浮窗一致：移动/缩放后持久化窗口位置与尺寸（两个悬浮窗共享已保存配置）
  state.interviewOverlayWindow.on('move', () => {
    if (!state.interviewOverlayWindow) return;
    const b = state.interviewOverlayWindow.getBounds();
    configHelper.setWindowPosition({ x: b.x, y: b.y });
  });

  state.interviewOverlayWindow.on('resize', () => {
    if (!state.interviewOverlayWindow) return;
    const b = state.interviewOverlayWindow.getBounds();
    configHelper.setWindowSize({ width: b.width, height: b.height });
  });

  const interviewUrl = getRendererUrl('#/overlay-interview');
  if (interviewUrl) state.interviewOverlayWindow.loadURL(interviewUrl);

  state.interviewOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  // 面试悬浮窗：完全鼠标穿透（与笔试悬浮窗一致）
  state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // 等页面加载完成后再显示，避免黑屏
  state.interviewOverlayWindow.once('ready-to-show', () => {
    state.interviewOverlayWindow?.show();
    state.interviewOverlayWindow?.showInactive();
    state.interviewOverlayWindow?.setIgnoreMouseEvents(true, { forward: true });
    state.interviewOverlayActive = true;
    state.interviewOverlayVisible = true;
  });
  // 兜底：3 秒内 ready-to-show 未触发则强制显示
  setTimeout(() => {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed() && !state.interviewOverlayVisible) {
      state.interviewOverlayWindow.show();
      state.interviewOverlayWindow.showInactive();
      state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
      state.interviewOverlayActive = true;
      state.interviewOverlayVisible = true;
    }
  }, 3000);
}

function showInterviewOverlay() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    state.interviewOverlayWindow.setOpacity(1.0);
    state.interviewOverlayWindow.showInactive();
    state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.interviewOverlayVisible = true;
    // 重新应用防捕获保护: 窗口隐藏/显示后 display affinity 可能被重置
    try { applyAntiCapture(state.interviewOverlayWindow); } catch (e) {
      console.warn('[Main] Re-apply anti-capture on interview show failed:', e);
    }
  }
}

function hideInterviewOverlay() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    state.interviewOverlayWindow.setOpacity(0);
    state.interviewOverlayWindow.hide();
    state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.interviewOverlayVisible = false;
  }
}

function toggleInterviewOverlay() {
  if (state.interviewOverlayVisible) hideInterviewOverlay();
  else showInterviewOverlay();
}

function moveInterviewOverlay(dx: number, dy: number) {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    const [x, y] = state.interviewOverlayWindow.getPosition();
    state.interviewOverlayWindow.setPosition(x + dx, y + dy, true);
  }
}

function resizeInterviewOverlay(dw: number, dh: number) {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    const [w, h] = state.interviewOverlayWindow.getSize();
    state.interviewOverlayWindow.setSize(Math.max(200, w + dw), Math.max(40, h + dh), true);
  }
}

function resetInterviewOverlayPosition() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    const [w, h] = state.interviewOverlayWindow.getSize();
    state.interviewOverlayWindow.setPosition(Math.floor((width - w) / 2), Math.floor((height - h) / 2), true);
  }
}

function closeInterviewOverlay() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    state.interviewOverlayWindow.close();
  }
  state.interviewOverlayWindow = null;
  state.interviewOverlayActive = false;
  state.interviewOverlayVisible = false;
}

// ===== overlay 适配器：将面试悬浮窗适配为 InterviewHelper 所需的 OverlayManager 接口 =====
const overlayAdapter = {
  render(payload: { type: 'exam' | 'interview'; title?: string; content: string; streaming?: boolean }) {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      showInterviewOverlay();
      state.interviewOverlayWindow.webContents.send('overlay:render', payload);
    }
  },
  renderTaskList(tasks: Array<{ id: string; question: string; answer?: string; keyPoints?: string[]; error?: string; status: string; ts: number }>) {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      showInterviewOverlay();
      state.interviewOverlayWindow.webContents.send('overlay:renderTasks', tasks);
    }
  },
  show() { showInterviewOverlay(); },
  hide() { hideInterviewOverlay(); },
  clear() {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      state.interviewOverlayWindow.webContents.send('overlay:clear');
    }
  },
};

// ===== 系统托盘（完全沿用原考试插件 + 秋招助手扩展） =====
function createTrayManager(): void {
  if (trayManager) return;
  const iconPath = getAssetPath('resources', 'icon.png');
  trayManager = new TrayManager({
    showMainWindow: () => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.show();
        state.mainWindow.focus();
      } else {
        createMainWindow();
      }
    },
    showLogin: () => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.show();
        state.mainWindow.focus();
      } else {
        createMainWindow();
      }
    },
    showSettings: () => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.show();
        state.mainWindow.focus();
      } else {
        createMainWindow();
      }
    },
    toggleOverlay: () => {
      if (state.overlayLocked) {
        // 悬浮框已存在：切换显示/隐藏（与 Command+B 语义一致，不销毁窗口）
        toggleOverlay();
        updateTrayState();
      } else {
        // 悬浮框不存在：启动它
        launchExamClient().then((r) => {
          if (r.success) updateTrayState();
        });
      }
    },
    refreshCredits: () => {
      authManager.isAuthenticated().then((authed) => {
        if (!authed) return;
        authManager.getProfile().then(() => updateTrayState());
      });
    },
    // 托盘兜底入口：填空/输入题场景下快捷键被拦截时，从托盘触发截图与搜题
    captureScreenshot: () => {
      void handleScreenshot(false);
    },
    searchQuestion: () => {
      void handleSearchAction(configHelper.getProcessingMode());
    },
    quit: () => {
      state.quitting = true;
      app.quit();
    },
  }, iconPath);
  trayManager.create();
}

function updateTrayState(): void {
  if (!trayManager) return;
  authManager.isAuthenticated().then((authed) => {
    const userInfo = configHelper.getUserInfo();
    const credits = userInfo?.credits;
    const email = userInfo?.email;
    trayManager?.setState({
      isAuthenticated: authed,
      isOverlayActive: state.overlayLocked,
      credits: typeof credits === 'number' ? credits : undefined,
      email,
    });
  });
}

/** 从后端拉取最新积分并刷新托盘/界面 */
function refreshCreditsFromServer(): void {
  authManager.isAuthenticated().then((authed) => {
    if (!authed) return;
    authManager.getProfile().then(() => updateTrayState()).catch(() => {});
  });
}

// ===== 应用初始化 =====
async function initializeApp(): Promise<void> {
  configHelper.init();

  authManager = new AuthManager(configHelper);
  authManager.init();
  ctx.authManager = authManager;

  screenshotHelper = new ScreenshotHelper(configHelper);
  screenshotHelper.init();
  ctx.screenshot = screenshotHelper;

  shortcutsHelper = new ShortcutsHelper(configHelper);
  shortcutsHelper.init();
  shortcutsHelper.setHandler(handleShortcutAction);
  ctx.shortcuts = shortcutsHelper;
  // 启动时立即注册全局快捷键，确保 Command+B 可随时启动悬浮框
  shortcutsHelper.registerGlobalShortcuts();

  processingHelper = new LightweightProcessingHelper(configHelper);
  ctx.processing = processingHelper;

  ttsHelper = new TtsHelper(configHelper);
  ttsHelper.init();
  ctx.tts = ttsHelper;

  byteDanceTtsHelper = new ByteDanceTtsHelper(configHelper, authManager);
  byteDanceTtsHelper.init();

  realtimeVoiceHelper = new RealtimeVoiceHelper(configHelper);

  interviewHelper = new InterviewHelper(configHelper, authManager, overlayAdapter as unknown as OverlayManager, ttsHelper, byteDanceTtsHelper, realtimeVoiceHelper);
  ctx.interview = interviewHelper;

  updateChecker = new UpdateChecker();
  ctx.updateChecker = updateChecker;

  // 定期同步 processingHelper 的窗口引用，避免事件丢失
  setInterval(() => {
    processingHelper.setMainWindow(state.overlayWindow);
  }, 200);

  // 注册 IPC
  registerIpcHandlers(ctx, () => state.mainWindow, () => state.overlayWindow, {
    createOverlayWindow,
    showOverlay,
    hideOverlay,
    toggleOverlay,
    moveOverlay,
    resizeOverlay,
    setWindowBounds,
    getWindowBounds,
    resetWindowPosition,
    setBackgroundOpacity,
    setZoomFactor,
    setTheme,
    setIgnoreMouseEvents,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    handleScreenshot,
    handleSearchAction,
    launchExamClient,
    closeExamClient,
    switchProcessingMode,
    startShortcutTest,
    cancelShortcutTest,
    shortcutsHelper,
    openEmbeddedWindow,
  });

  // ===== 笔试悬浮窗状态查询 =====
  ipcMain.handle('exam:isActive', () => state.overlayLocked);

  // ===== 面试悬浮窗 IPC（独立于笔试悬浮窗） =====
  ipcMain.handle('interview-overlay:create', () => { createInterviewOverlayWindow(); return true; });
  ipcMain.handle('interview-overlay:show', () => { showInterviewOverlay(); return true; });
  ipcMain.handle('interview-overlay:hide', () => { hideInterviewOverlay(); return true; });
  ipcMain.handle('interview-overlay:close', () => { closeInterviewOverlay(); return true; });
  ipcMain.handle('interview-overlay:isActive', () => state.interviewOverlayActive);

  // 创建主窗口
  createMainWindow();

  // 托盘
  createTrayManager();

  // 验证登录
  const authed = await authManager.isAuthenticated();
  if (!authed) {
    state.mainWindow?.webContents.send('auth:require-login');
  } else {
    await authManager.validateSession().catch(() => {});
    refreshCreditsFromServer();
  }
  updateTrayState();

  // 启动版本更新自动检测（启动后 5 秒检测一次，之后每小时检测一次）
  updateChecker.startAutoCheck();

  // 每 60 秒静默刷新一次积分，保持多端同步
  setInterval(() => refreshCreditsFromServer(), 60_000);
}

// ===== 单实例 + 生命周期 =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  app.whenReady().then(async () => {
    // Do not let macOS' default application menu consume Command+Q and quit
    // the client while the user is working. The app remains tray-resident;
    // quitting is available only through an explicit lifecycle action.
    Menu.setApplicationMenu(null);
    await configureMacPermissions();
    await initializeApp().catch((e) => {
      console.error('[Main] Init failed:', e);
      createMainWindow();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (state.quitting) return;
    // 保持后台运行（托盘），不退出应用
  });

  app.on('before-quit', () => {
    state.quitting = true;
    shortcutsHelper?.unregisterAll();
    processingHelper?.cancelStreaming();
    interviewHelper?.stop?.();
    ttsHelper?.destroy?.();
    byteDanceTtsHelper?.destroy?.();
    realtimeVoiceHelper?.destroy?.();
    updateChecker?.stopAutoCheck();
    trayManager?.destroy();
    // 关闭面试悬浮窗
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      state.interviewOverlayWindow.destroy();
    }
  });

  // 防止后台节流
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}
