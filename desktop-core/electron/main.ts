// QuizMate考试助手 - 主进程入口
// 笔试助手完全沿用原考试插件（QuizMate-Windows）的代码逻辑：
//   - 快捷键系统（Alt+Q 截图 / Alt+E 搜题 / Alt+B 笔试悬浮框 / Alt+R 面试会话）
//   - 截图→压缩→OSS/直传→AI 分析→悬浮窗展示/TTS 播报 完整流程
//   - overlay/voice 双模式切换
//   - 防捕获保护（WDA_EXCLUDEFROMCAPTURE + WS_EX_TOOLWINDOW + 空标题）
//   - 托盘忙碌图标 + voice 模式进度通知
// Windows 客户端保留笔试助手与面试助手；网申流程由共享账号体系下的浏览器插件提供。
import { app, BrowserWindow, screen, shell, globalShortcut, ipcMain, nativeImage, Menu, session, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { ConfigHelper } from './ConfigHelper';
import { AuthManager } from './AuthManager';
import { TrayManager } from './TrayManager';
import { registerIpcHandlers, wireMainWindowVisibility } from './ipcHandlers';
import { ScreenshotHelper } from './helpers/ScreenshotHelper';
import type { ScreenshotResult } from './helpers/ScreenshotHelper';
import { LightweightProcessingHelper } from './helpers/ProcessingHelper';
import { ShortcutsHelper } from './ShortcutsHelper';
import { TtsHelper } from './helpers/TtsHelper';
import { ByteDanceTtsHelper } from './helpers/ByteDanceTtsHelper';
import { SapiVoiceHelper } from './helpers/SapiVoiceHelper';
import { RealtimeVoiceHelper } from './helpers/RealtimeVoiceHelper';
import { PermissionOnboardingHelper } from './helpers/PermissionOnboardingHelper';
import { applyAllProtections, applyAntiCapture, readContentProtection, startProtectionWatchdog, ProtectionWatchdog, ProtectionResult } from './helpers/protection';
import { InterviewHelper } from './helpers/InterviewHelper';
import { OverlayManager } from './OverlayManager';
import { UpdateChecker } from './UpdateChecker';
import { ShortcutAction, ProcessingMode } from '../shared/shortcuts';
import { selectActiveOverlay, selectFreshScreenshot, shouldEnsureExamOverlay } from '../shared/overlay-state';
import { toBusinessVersion } from './version';

// ===== 平台常量（唯一的平台差异入口） =====
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
/** 客户端平台标识, 与后端账号体系/官网注入头保持一致 */
const CLIENT_PLATFORM = IS_MAC ? 'darwin-desktop' : 'win32-desktop';

// ===== 应用状态（沿用原考试插件 state 结构） =====
interface AppState {
  mainWindow: BrowserWindow | null;       // 主窗口（配置/控制台，等同于原考试的 configWindow）
  overlayWindow: BrowserWindow | null;     // 笔试悬浮窗（加载 /overlay-exam 路由，原考试插件 UI）
  interviewOverlayWindow: BrowserWindow | null; // 面试悬浮窗（加载 /overlay-interview 路由，面试任务卡片 UI）
  isOverlayVisible: boolean;
  overlayLocked: boolean;                  // 笔试悬浮框是否已启动（考试客户端生命周期）
  interviewOverlayActive: boolean;         // 面试悬浮框是否已启动
  interviewOverlayVisible: boolean;        // 面试悬浮框当前是否可见
  lastActiveOverlay: 'exam' | 'interview'; // 最近启动/显示的悬浮框，窗口调节快捷键只作用于它
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  step: number;                            // 窗口移动步长
  currentX: number;
  currentY: number;
  quitting: boolean;
  skipRestoreOnClose: boolean;             // 关闭悬浮框时不注销快捷键（Alt+B 保持可用）
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
  lastActiveOverlay: 'exam',
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
let sapiVoiceHelper: SapiVoiceHelper | null = null; // Windows 专属离线识别兜底(SAPI), mac 上不实例化
let realtimeVoiceHelper: RealtimeVoiceHelper;
let interviewHelper: InterviewHelper;
let updateChecker: UpdateChecker;
let permissionOnboardingHelper: PermissionOnboardingHelper;
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
  permissions: null as PermissionOnboardingHelper | null,
};

// ===== 工具函数 =====
function getAssetPath(...segments: string[]) {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, ...segments);
}

function getAppIconPath(): string | undefined {
  // 平台图标差异: Windows 用 icon.ico, macOS 用 icon.png(各构建壳 resources 提供)
  const iconFile = IS_MAC ? 'icon.png' : 'icon.ico';
  const iconPath = getAssetPath('resources', iconFile);
  if (fs.existsSync(iconPath)) return iconPath;
  return undefined;
}

function restoreMainWindow(): void {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (IS_MAC) app.dock?.show();
  try { win.setSkipTaskbar(false); } catch {}
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  createTrayManager();
}

function hideMainWindowOnMinimize(): void {
  const win = state.mainWindow;
  if (!win || win.isDestroyed() || state.quitting) return;
  try { win.setSkipTaskbar(true); } catch {}
  if (IS_MAC) app.dock?.hide();
  trayManager?.destroy();
  win.hide();
}

// 生成 Q 图标（当 icon.ico 不存在时使用）
function getGeneratedIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="48" fill="#2268df"/><text x="128" y="185" font-family="Arial,sans-serif" font-size="180" font-weight="bold" fill="white" text-anchor="middle">Q</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
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
// 充值改为客户端内嵌弹窗（向主窗口发送 IPC 事件，由渲染层展示 RechargeModal）
// 注册仍走外部窗口加载官网页面
function openEmbeddedWindow(kind: 'recharge' | 'register') {
  if (kind === 'recharge') {
    // 打开充值页面（官网 recharge.html，注入 token 自动登录）
    const cfg = configHelper.getAppConfig();
    const url = cfg.rechargeUrl || 'https://quizmate.cn/recharge.html';
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
      },
    });
    // 注入 token 让官网自动登录
    const token = configHelper.getAuthToken();
    rechargeWin.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = { ...details.requestHeaders };
      if (token) headers['X-Account-Token'] = token;
      headers['X-Client-Version'] = toBusinessVersion(app.getVersion());
      headers['X-Client-Platform'] = CLIENT_PLATFORM;
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
    headers['X-Client-Version'] = toBusinessVersion(app.getVersion());
    headers['X-Client-Platform'] = CLIENT_PLATFORM;
    cb({ requestHeaders: headers });
  });
  win.loadURL(url);
}

// ===== 平台权限与环境初始化（macOS 专属） =====
async function configurePlatformPermissions(): Promise<void> {
  if (!IS_MAC) return;
  // 仅放行音频类 media 权限(麦克风/系统音频), 明确拒绝摄像头
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

  // Do not trigger a context-free TCC prompt here. The first-launch wizard
  // explains each capability and runs a real input/capture probe immediately.
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

  state.mainWindow.on('ready-to-show', () => {
    if (IS_MAC) app.dock?.show();
    state.mainWindow?.setSkipTaskbar(false);
    state.mainWindow?.show();
  });
  state.mainWindow.on('minimize' as never, (event: Electron.Event) => {
    const hideChrome = configHelper.getClientSettings().hideAppChromeOnMinimize !== false;
    if (hideChrome) {
      event.preventDefault();
      hideMainWindowOnMinimize();
    } else {
      try { state.mainWindow?.setSkipTaskbar(false); } catch {}
      if (IS_MAC) app.dock?.show();
      createTrayManager();
    }
  });
  // 窗口获得焦点时从后端刷新积分，保证多端实时同步
  state.mainWindow.on('focus', () => refreshCreditsFromServer());
  // 同步更新检测器的主窗口引用，用于推送更新状态
  updateChecker?.setMainWindow(state.mainWindow);
  // 主窗口可见性变化 → 推送给所有渲染层（含悬浮框/嵌入充值页），
  // 让渲染层判断是否允许弹「积分不足蒙版」。
  wireMainWindowVisibility(() => state.mainWindow);

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

// ===== 悬浮窗（透明、置顶、防捕获） =====
// 亲和性看门狗句柄（悬浮窗销毁/重建时复用）
let overlayProtectionWatchdog: ProtectionWatchdog | null = null;
let interviewProtectionWatchdog: ProtectionWatchdog | null = null;
let screenshotInFlight = false;
interface AnalysisOperationState { operationId: string; requestId: string; attempt: number }
let pendingAnalysisOperation: AnalysisOperationState | null = null;

type OverlayKind = 'exam' | 'interview';

function getOverlayWindow(kind: OverlayKind): BrowserWindow | null {
  return kind === 'exam' ? state.overlayWindow : state.interviewOverlayWindow;
}

function isOverlayVisible(kind: OverlayKind): boolean {
  const win = getOverlayWindow(kind);
  return !!(win && !win.isDestroyed() && win.isVisible());
}

function activateOverlay(kind: OverlayKind): void {
  const win = getOverlayWindow(kind);
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  state.lastActiveOverlay = kind;
  try {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  } catch (error) {
    console.warn(`[Main] Failed to raise ${kind} overlay:`, error);
  }
}

function getActiveOverlayKind(): OverlayKind {
  return selectActiveOverlay(state.lastActiveOverlay, {
    exam: isOverlayVisible('exam'),
    interview: isOverlayVisible('interview'),
  });
}

function activateRemainingOverlay(closedOrHidden: OverlayKind): void {
  const fallback: OverlayKind = closedOrHidden === 'exam' ? 'interview' : 'exam';
  if (isOverlayVisible(fallback)) activateOverlay(fallback);
}

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

  // ===== 防捕获 / 防检测保护 =====
  // 应用后读回验证(applyAllProtections 内部), 并由看门狗周期性监测亲和性漂移、自动重新应用
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
  if (overlayProtectionWatchdog) overlayProtectionWatchdog.stop();
  overlayProtectionWatchdog = startProtectionWatchdog(state.overlayWindow, { label: 'exam-overlay' });

  state.overlayWindow.webContents.on('did-finish-load', () => {
    state.overlayWindow?.webContents.send('background-opacity-changed', configHelper.getBackgroundOpacity());
    state.overlayWindow?.webContents.send('client-theme-changed', state.currentTheme);
    state.overlayWindow?.webContents.setZoomFactor(state.zoomFactor);
  });

  state.overlayWindow.on('move', () => {
    if (!state.overlayWindow) return;
    // 窗口移动后复位鼠标穿透，修复按钮悬停状态可能卡在“可点击”
    state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    const b = state.overlayWindow.getBounds();
    state.windowPosition = { x: b.x, y: b.y };
    state.currentX = b.x;
    state.currentY = b.y;
    configHelper.setWindowPosition({ x: b.x, y: b.y });
  });

  state.overlayWindow.on('resize', () => {
    if (!state.overlayWindow) return;
    // 窗口缩放后复位鼠标穿透
    state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    const b = state.overlayWindow.getBounds();
    state.windowSize = { width: b.width, height: b.height };
    configHelper.setWindowSize({ width: b.width, height: b.height });
    state.overlayWindow.webContents.send('window-resized', { width: b.width, height: b.height });
  });

  state.overlayWindow.on('closed', () => {
    state.overlayWindow = null;
    state.isOverlayVisible = false;
    state.overlayLocked = false;
    if (overlayProtectionWatchdog) {
      overlayProtectionWatchdog.stop();
      overlayProtectionWatchdog = null;
    }
    activateRemainingOverlay('exam');
  });

  const overlayUrl = getRendererUrl('#/overlay-exam');
  if (overlayUrl) state.overlayWindow.loadURL(overlayUrl);

  state.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  state.overlayWindow.setSkipTaskbar(true);
  // 窗口创建后立即设置鼠标穿透（核心：永不关闭）
  state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // 等页面加载完成后再显示，避免黑屏（loadURL 是异步的）
  state.overlayWindow.once('ready-to-show', () => {
    state.overlayWindow?.show();
    state.overlayWindow?.showInactive();
    state.overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
    state.isOverlayVisible = true;
    state.overlayLocked = true;
    activateOverlay('exam');
  });
  // 兜底：如果 ready-to-show 在 3 秒内没触发，强制显示
  setTimeout(() => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed() && !state.isOverlayVisible) {
      state.overlayWindow.show();
      state.overlayWindow.showInactive();
      state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      state.isOverlayVisible = true;
      state.overlayLocked = true;
      activateOverlay('exam');
    }
  }, 3000);

  // 同步 processingHelper 的窗口引用
  processingHelper.setMainWindow(state.overlayWindow);
}

function showOverlay(markActive = true) {
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
    if (markActive) activateOverlay('exam');
  }
}

function hideOverlay() {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    // 完全隐藏窗口，确保截图时不可见
    state.overlayWindow.setOpacity(0);
    state.overlayWindow.hide();
    state.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isOverlayVisible = false;
    activateRemainingOverlay('exam');
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
  const win = getOverlayWindow(getActiveOverlayKind());
  if (win && !win.isDestroyed()) win.webContents.send('background-opacity-changed', clamped);
}

function setZoomFactor(factor: number) {
  state.zoomFactor = Math.max(0.5, Math.min(2.0, factor));
  configHelper.updateClientSettings({ zoomFactor: state.zoomFactor });
  const win = getOverlayWindow(getActiveOverlayKind());
  if (win && !win.isDestroyed()) win.webContents.setZoomFactor(state.zoomFactor);
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

// ===== 快捷键处理 =====
// 笔试/面试生命周期独立；窗口调节类动作只路由到最近启动或显示的悬浮窗。
async function handleShortcutAction(action: ShortcutAction): Promise<void> {
  const activeOverlay = getActiveOverlayKind();
  switch (action) {
    case 'screenshot': {
      const mode = configHelper.getProcessingMode();
      // 语音模式截图不创建、不显示笔试悬浮框。
      if (shouldEnsureExamOverlay(mode, 'screenshot')) {
        if (!state.overlayWindow || state.overlayWindow.isDestroyed() || !state.isOverlayVisible) await launchExamClient();
        else activateOverlay('exam');
      }
      await handleScreenshot(false);
      break;
    }
    case 'search': {
      const mode = configHelper.getProcessingMode();
      if (shouldEnsureExamOverlay(mode, 'search')) {
        if (!state.overlayWindow || state.overlayWindow.isDestroyed() || !state.isOverlayVisible) await launchExamClient();
        else activateOverlay('exam');
      }
      await handleSearchAction(mode);
      break;
    }
    case 'replay':
      if (activeOverlay === 'interview') {
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
      if (activeOverlay === 'interview') {
        interviewHelper?.clearTasks?.();
      } else {
        await handleReset();
      }
      break;
    case 'toggle_visibility':
      // Alt+B 永远只控制笔试悬浮框，不受面试状态影响。
      if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
        await launchExamClient();
      } else {
        toggleOverlay();
      }
      break;
    case 'interview_start':
      await toggleInterviewSession();
      break;
    case 'interview_prev_question':
      state.interviewOverlayWindow?.webContents.send('interview:navigate', { direction: 'prev' });
      break;
    case 'interview_next_question':
      state.interviewOverlayWindow?.webContents.send('interview:navigate', { direction: 'next' });
      break;
    case 'move_up':    activeOverlay === 'interview' ? moveInterviewOverlay(0, -state.step) : moveOverlay(0, -state.step); break;
    case 'move_down':  activeOverlay === 'interview' ? moveInterviewOverlay(0, state.step)  : moveOverlay(0, state.step); break;
    case 'move_left':  activeOverlay === 'interview' ? moveInterviewOverlay(-state.step, 0) : moveOverlay(-state.step, 0); break;
    case 'move_right': activeOverlay === 'interview' ? moveInterviewOverlay(state.step, 0)  : moveOverlay(state.step, 0); break;
    case 'resize_width_smaller':   activeOverlay === 'interview' ? resizeInterviewOverlay(-20, 0) : resizeOverlay(-20, 0); break;
    case 'resize_width_larger':    activeOverlay === 'interview' ? resizeInterviewOverlay(20, 0)  : resizeOverlay(20, 0); break;
    case 'resize_height_smaller':  activeOverlay === 'interview' ? resizeInterviewOverlay(0, -20) : resizeOverlay(0, -20); break;
    case 'resize_height_larger':   activeOverlay === 'interview' ? resizeInterviewOverlay(0, 20)  : resizeOverlay(0, 20); break;
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
      if (activeOverlay === 'interview') {
        state.interviewOverlayWindow?.webContents.send('toggle-raw-output');
      } else {
        state.overlayWindow?.webContents.send('toggle-raw-output');
      }
      break;
    case 'copy_content':
      if (activeOverlay === 'interview') {
        state.interviewOverlayWindow?.webContents.send('copy-content');
      } else {
        state.overlayWindow?.webContents.send('copy-content');
      }
      break;
    case 'delete_latest_screenshot':
      screenshotHelper.deleteLatest(false);
      state.overlayWindow?.webContents.send('screenshot-deleted', { isExtra: false });
      break;
    case 'reset_position':
      activeOverlay === 'interview' ? resetInterviewOverlayPosition() : resetWindowPosition();
      break;
    case 'refresh_config':
      state.overlayWindow?.webContents.send('refresh-config');
      state.interviewOverlayWindow?.webContents.send('refresh-config');
      state.mainWindow?.webContents.send('refresh-config');
      break;
    case 'restore_main_window':
      restoreMainWindow();
      break;
    default:
      console.warn('[Main] Unknown shortcut action:', action);
  }
}

// ===== 截图→分析编排（完全沿用原考试插件流程） =====
async function handleScreenshot(isExtra: boolean): Promise<void> {
  const operation: AnalysisOperationState = {
    operationId: crypto.randomUUID(),
    requestId: `desktop-${crypto.randomUUID()}`,
    attempt: 1,
  };
  const captureStartedAt = Date.now();
  const previousAnalysisOperation = pendingAnalysisOperation;
  let capturedForOperation = false;
  if (screenshotInFlight) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('screenshot-error', { error: '截图正在处理中，请稍候', code: 'CAPTURE_IN_FLIGHT', stage: 'capture' });
    });
    return;
  }
  screenshotInFlight = true;
  try {
    // 主截图代表新的答题轮次：取消上一轮并先切换 operationId，
    // 使上一轮迟到事件无法覆盖本轮截图。
    if (!isExtra) processingHelper.cancelStreaming();
    pendingAnalysisOperation = operation;
    const appConfig = configHelper.getAppConfig();
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('screenshot-started', { isExtra, ...operation });
    });
    processingHelper.recordDiagnosticEvent('capture.start', { ...operation, isExtra });

    // 截图前隐藏悬浮窗(以窗口实际可见性为准, 不依赖模式与状态标志)，
    // 确保自身截图在任何情况下都不包含悬浮框--即使防捕获亲和性失效也兜底
    const examOverlayWasVisible = !!(
      state.overlayWindow && !state.overlayWindow.isDestroyed() && state.overlayWindow.isVisible()
    );
    const interviewOverlayWasVisible = !!(
      state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed() && state.interviewOverlayWindow.isVisible()
    );
    const previouslyActiveOverlay = state.lastActiveOverlay;
    // A protected window should remain visible locally and be absent from normal
    // capture APIs. On Electron versions without readback, hide as a fallback.
    const examOverlayProtectionState = state.overlayWindow && !state.overlayWindow.isDestroyed()
      ? readContentProtection(state.overlayWindow)
      : null;
    const interviewOverlayProtectionState = state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()
      ? readContentProtection(state.interviewOverlayWindow)
      : null;
    const needsTemporaryHide = examOverlayWasVisible || interviewOverlayWasVisible;
    if (examOverlayWasVisible) hideOverlay();
    if (interviewOverlayWasVisible) hideInterviewOverlay();
    if (needsTemporaryHide) {
      await new Promise((r) => setTimeout(r, Math.max(appConfig.screenshotHideDelayMs, 180)));
    }

    let result: ScreenshotResult;
    try {
      result = await screenshotHelper.captureFullScreen();
    } catch (error) {
      console.error('[Main] Screenshot capture threw:', error);
      result = { success: false, error: '截图失败，请检查屏幕录制权限后重试', code: 'CAPTURE_THROWN', stage: 'capture' };
    } finally {
      if (needsTemporaryHide) {
        await new Promise((r) => setTimeout(r, appConfig.screenshotRestoreDelayMs));
        if (examOverlayWasVisible) showOverlay(false);
        if (interviewOverlayWasVisible) showInterviewOverlay(false);
        if (isOverlayVisible(previouslyActiveOverlay)) activateOverlay(previouslyActiveOverlay);
      }
    }

    if (result.success && result.filePath) {
      if (!isExtra) screenshotHelper.clearQueue(false);
      const saved = await screenshotHelper.saveToQueue(result.filePath, isExtra);
      if (!saved) {
        throw new Error('截图已采集，但保存失败');
      }
      const base64 = await screenshotHelper.fileToBase64(saved);
      if (!base64) {
        throw new Error('截图已保存，但读取失败');
      }
      const payload = { path: saved, base64, isExtra };
      capturedForOperation = true;
      processingHelper.recordDiagnosticEvent('capture.success', {
        ...operation,
        isExtra,
        totalMs: Date.now() - captureStartedAt,
        examOverlayWasVisible,
        interviewOverlayWasVisible,
        overlayTemporarilyHidden: needsTemporaryHide,
        examContentProtectionReported: examOverlayProtectionState,
        interviewContentProtectionReported: interviewOverlayProtectionState,
      });
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('screenshot-added', { ...payload, ...operation });
      });
      // macOS Retina screenshots are often several MB. Prepare the bounded JPEG
      // after the capture result is delivered so the later Search action can
      // reuse an in-flight/completed result instead of starting from zero.
      if (IS_MAC) screenshotHelper.prewarmCompressedBase64(saved);
      return;
    }

    const payload = { error: result.error || '截图失败，请稍后重试', code: result.code || 'CAPTURE_FAILED', stage: result.stage || 'capture', action: 'retry', ...operation };
    processingHelper.recordDiagnosticEvent('capture.error', { ...payload, totalMs: Date.now() - captureStartedAt });
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('screenshot-error', payload);
    });
    try {
      if (Notification.isSupported()) {
        new Notification({ title: 'QuizMate 截图失败', body: payload.error }).show();
      }
    } catch (error) {
      console.warn('[Main] Screenshot failure notification failed:', error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = { error: message || '截图失败，请稍后重试', code: 'SCREENSHOT_PIPELINE_FAILED', stage: 'save-queue', action: 'retry', ...operation };
    processingHelper.recordDiagnosticEvent('capture.error', { ...payload, totalMs: Date.now() - captureStartedAt });
    console.error('[Main] Screenshot pipeline failed:', error);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('screenshot-error', payload);
    });
  } finally {
    if (!capturedForOperation && pendingAnalysisOperation?.operationId === operation.operationId) {
      pendingAnalysisOperation = previousAnalysisOperation;
    }
    screenshotInFlight = false;
  }
}

async function handleSearchAction(mode: ProcessingMode): Promise<void> {
  const procMode = configHelper.getProcessingMode();
  let queue = screenshotHelper.getQueue(false);

  // 语音模式的每次搜题都是新一轮：隐藏笔试悬浮框并重新截取当前屏幕。
  // 截图失败时不得退回分析队列中的旧图。
  if (procMode === 'voice') {
    if (isOverlayVisible('exam')) hideOverlay();
    const previousLatestShot = queue[queue.length - 1];
    notifyVoiceProgress('正在截图...');
    setTrayBusy(true);
    await handleScreenshot(false);
    queue = screenshotHelper.getQueue(false);
    if (!selectFreshScreenshot(previousLatestShot, queue)) {
      const errMsg = '未获取到新截图，请重试';
      ttsHelper?.cancel();
      ttsHelper?.speak(errMsg).catch(() => {});
      notifyVoiceProgress(null);
      setTrayBusy(false);
      return;
    }
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
  const operation = pendingAnalysisOperation ?? {
    operationId: crypto.randomUUID(),
    requestId: `desktop-${crypto.randomUUID()}`,
    attempt: 1,
  };
  const compressStartedAt = Date.now();
  const compressed = await screenshotHelper.getCompressedScreenshot(latestShot);
  const b64 = compressed.dataUrl;
  processingHelper.recordDiagnosticEvent(b64 ? 'compress.success' : 'compress.error', {
    ...operation,
    totalMs: Date.now() - compressStartedAt,
    compressionMs: compressed.compressionMs,
    waitMs: compressed.waitMs,
    cacheHit: compressed.cacheHit,
    originalBytes: compressed.originalBytes,
    outputBytes: compressed.outputBytes,
    originalWidth: compressed.originalWidth,
    originalHeight: compressed.originalHeight,
    outputWidth: compressed.outputWidth,
    outputHeight: compressed.outputHeight,
    quality: compressed.quality,
  });
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
  const result = await processingHelper.analyze({ images: [b64], mode, ...operation });
  if (result.success) {
    // 只有当前轮次可以清空队列；上一轮迟到结果不得删除用户刚截的新图。
    if (pendingAnalysisOperation?.operationId === operation.operationId) {
      screenshotHelper.clearAll();
      state.overlayWindow?.webContents.send('screenshots-cleared', { ...operation });
      pendingAnalysisOperation = null;
    }
  } else {
    if (pendingAnalysisOperation?.operationId === operation.operationId) {
      const outcomeUnknown = result.stage === 'timeout' || result.stage === 'network';
      pendingAnalysisOperation = {
        ...operation,
        requestId: outcomeUnknown ? operation.requestId : `desktop-${crypto.randomUUID()}`,
        attempt: operation.attempt + 1,
      };
    }
    console.warn('[Main] analyze failed, keeping screenshot queue for retry:', {
      code: result.errorCode,
      stage: result.stage,
      error: result.error,
    });
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
    // 切到 overlay 模式：恢复所有快捷键，不自动启动悬浮框（等用户按 Alt+B）
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
    // 与笔试窗同时首次出现时保留少量错位，用户可看出两个窗口都已启动。
    x: savedPos ? savedPos.x + 36 : 86,
    y: savedPos ? savedPos.y + 36 : 86,
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

  // 防捕获保护（与笔试悬浮窗一致：应用后读回验证 + 看门狗监测漂移）
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
  if (interviewProtectionWatchdog) interviewProtectionWatchdog.stop();
  interviewProtectionWatchdog = startProtectionWatchdog(state.interviewOverlayWindow, { label: 'interview-overlay' });

  state.interviewOverlayWindow.webContents.on('did-finish-load', () => {
    state.interviewOverlayWindow?.webContents.send('background-opacity-changed', configHelper.getBackgroundOpacity());
    state.interviewOverlayWindow?.webContents.send('client-theme-changed', state.currentTheme);
    state.interviewOverlayWindow?.webContents.setZoomFactor(state.zoomFactor);
  });

  state.interviewOverlayWindow.on('closed', () => {
    state.interviewOverlayWindow = null;
    state.interviewOverlayActive = false;
    state.interviewOverlayVisible = false;
    if (interviewProtectionWatchdog) {
      interviewProtectionWatchdog.stop();
      interviewProtectionWatchdog = null;
    }
    if (interviewHelper?.isListening()) interviewHelper.stop();
    activateRemainingOverlay('interview');
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
    activateOverlay('interview');
  });
  // 兜底：3 秒内 ready-to-show 未触发则强制显示
  setTimeout(() => {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed() && !state.interviewOverlayVisible) {
      state.interviewOverlayWindow.show();
      state.interviewOverlayWindow.showInactive();
      state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
      state.interviewOverlayActive = true;
      state.interviewOverlayVisible = true;
      activateOverlay('interview');
    }
  }, 3000);
}

function showInterviewOverlay(markActive = true) {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    state.interviewOverlayWindow.setOpacity(1.0);
    state.interviewOverlayWindow.showInactive();
    state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.interviewOverlayVisible = true;
    // 重新应用防捕获保护: 窗口隐藏/显示后 display affinity 可能被重置
    try { applyAntiCapture(state.interviewOverlayWindow); } catch (e) {
      console.warn('[Main] Re-apply anti-capture on interview show failed:', e);
    }
    if (markActive) activateOverlay('interview');
  }
}

function hideInterviewOverlay() {
  if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
    state.interviewOverlayWindow.setOpacity(0);
    state.interviewOverlayWindow.hide();
    state.interviewOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    state.interviewOverlayVisible = false;
    activateRemainingOverlay('interview');
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
  activateRemainingOverlay('interview');
}

async function startInterviewSession(context?: unknown): Promise<{ running: boolean }> {
  const createdForStart = !state.interviewOverlayWindow || state.interviewOverlayWindow.isDestroyed();
  if (createdForStart) createInterviewOverlayWindow();
  else showInterviewOverlay();
  try {
    await interviewHelper.start(context as any);
    if (!interviewHelper.isListening()) throw new Error('请先登录后再开始面试');
    state.interviewOverlayActive = true;
    state.interviewOverlayVisible = true;
    activateOverlay('interview');
    return { running: true };
  } catch (error) {
    if (createdForStart) closeInterviewOverlay();
    throw error;
  }
}

async function stopInterviewSession(): Promise<{ running: boolean }> {
  try {
    if (interviewHelper?.isListening()) interviewHelper.stop();
  } finally {
    closeInterviewOverlay();
  }
  return { running: false };
}

async function toggleInterviewSession(): Promise<{ running: boolean }> {
  return interviewHelper?.isListening() ? stopInterviewSession() : startInterviewSession();
}

// ===== overlay 适配器：将面试悬浮窗适配为 InterviewHelper 所需的 OverlayManager 接口 =====
const overlayAdapter = {
  render(payload: { type: 'exam' | 'interview'; title?: string; content: string; streaming?: boolean }) {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      if (!screenshotInFlight) showInterviewOverlay(false);
      state.interviewOverlayWindow.webContents.send('overlay:render', payload);
    }
  },
  renderTaskList(tasks: Array<{ id: string; question: string; answer?: string; keyPoints?: string[]; error?: string; status: string; ts: number }>) {
    if (state.interviewOverlayWindow && !state.interviewOverlayWindow.isDestroyed()) {
      if (!screenshotInFlight) showInterviewOverlay(false);
      state.interviewOverlayWindow.webContents.send('overlay:renderTasks', tasks);
    }
  },
  show() { showInterviewOverlay(false); },
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
  const iconPath = getAssetPath('resources', IS_MAC ? 'icon.png' : 'icon.ico');
  trayManager = new TrayManager({
    showMainWindow: () => restoreMainWindow(),
    showLogin: () => restoreMainWindow(),
    showSettings: () => restoreMainWindow(),
    toggleOverlay: () => {
      if (state.overlayLocked) {
        // 悬浮框已存在：切换显示/隐藏（与 Alt+B 语义一致，不销毁窗口）
        toggleOverlay();
        updateTrayState();
      } else {
        // 悬浮框不存在：启动它
        launchExamClient().then((r) => {
          if (r.success) updateTrayState();
        });
      }
    },
    // 托盘兜底：考试输入框/输入法拦截全局快捷键时，可用鼠标从托盘触发截图与搜题
    captureScreenshot: async () => {
      const mode = configHelper.getProcessingMode();
      if (mode !== 'voice' && (!state.overlayWindow || state.overlayWindow.isDestroyed() || !state.isOverlayVisible)) {
        const r = await launchExamClient();
        if (!r.success) return;
      }
      await handleScreenshot(false);
    },
    searchQuestion: async () => {
      const mode = configHelper.getProcessingMode();
      if (mode !== 'voice' && (!state.overlayWindow || state.overlayWindow.isDestroyed() || !state.isOverlayVisible)) {
        const r = await launchExamClient();
        if (!r.success) return;
      }
      await handleSearchAction(mode);
    },
    refreshCredits: () => {
      authManager.isAuthenticated().then((authed) => {
        if (!authed) return;
        authManager.getProfile().then(() => updateTrayState());
      });
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

  // macOS: 麦克风预授权 / media 权限白名单 / Dock 图标
  await configurePlatformPermissions();

  // Must run before the first BrowserWindow and before any capture session is
  // created. This is the install-replacement boundary available to a DMG app:
  // the first launch from /Applications after the new app has replaced the old.
  permissionOnboardingHelper = new PermissionOnboardingHelper(configHelper);
  ctx.permissions = permissionOnboardingHelper;
  await permissionOnboardingHelper.prepareLegacyMigration();

  authManager = new AuthManager(configHelper);
  authManager.init();
  ctx.authManager = authManager;

  screenshotHelper = new ScreenshotHelper(configHelper);
  screenshotHelper.init();
  ctx.screenshot = screenshotHelper;

  shortcutsHelper = new ShortcutsHelper(configHelper);
  shortcutsHelper.init();
  shortcutsHelper.setHandler(handleShortcutAction);
  shortcutsHelper.setRegistrationErrorHandler((data) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('shortcut-registration-error', data);
    });
  });
  ctx.shortcuts = shortcutsHelper;
  // 两个助手的快捷键启动时统一注册，动作在主进程中独立路由。
  shortcutsHelper.registerGlobalShortcuts();

  processingHelper = new LightweightProcessingHelper(configHelper);
  ctx.processing = processingHelper;

  ttsHelper = new TtsHelper(configHelper);
  ttsHelper.init();
  ctx.tts = ttsHelper;

  byteDanceTtsHelper = new ByteDanceTtsHelper(configHelper, authManager);
  byteDanceTtsHelper.init();

  sapiVoiceHelper = new SapiVoiceHelper();
  sapiVoiceHelper.init();

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
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    handleScreenshot,
    handleSearchAction,
    launchExamClient,
    closeExamClient,
    startInterviewSession,
    stopInterviewSession,
    toggleInterviewSession,
    switchProcessingMode,
    startShortcutTest,
    cancelShortcutTest,
    shortcutsHelper,
    openEmbeddedWindow,
    restoreMainWindow,
  });

  // ===== 笔试悬浮窗状态查询 =====
  ipcMain.handle('exam:isActive', () => state.overlayLocked);

  // ===== 面试悬浮窗 IPC（独立于笔试悬浮窗） =====
  ipcMain.handle('interview-overlay:create', () => startInterviewSession());
  ipcMain.handle('interview-overlay:show', () => { showInterviewOverlay(); return true; });
  ipcMain.handle('interview-overlay:hide', () => { hideInterviewOverlay(); return true; });
  ipcMain.handle('interview-overlay:close', () => stopInterviewSession());
  ipcMain.handle('interview-overlay:isActive', () => state.interviewOverlayActive);

  // 创建主窗口
  createMainWindow();
  const replayShortcutRegistrationErrors = () => {
    const errors = shortcutsHelper.getRegistrationErrors();
    if (!errors.length) return;
    for (const error of errors) {
      state.mainWindow?.webContents.send('shortcut-registration-error', error);
    }
    shortcutsHelper.clearRegistrationErrors();
  };
  // Registration happens before BrowserWindow creation; replay after renderer load.
  state.mainWindow?.webContents.once('did-finish-load', replayShortcutRegistrationErrors);

  // 托盘
  createTrayManager();

  // 验证登录
  const authed = await authManager.isAuthenticated();
  if (!authed) {
    state.mainWindow?.webContents.send('auth:require-login');
  } else {
    await authManager.validateSession().catch(() => {});
    refreshCreditsFromServer();
    void updateChecker.checkForUpdates();
  }
  updateTrayState();

  // 登录进入时已检测一次；此处仅保留每小时后台复查。
  updateChecker.startAutoCheck();

  // 每 60 秒静默刷新一次积分，保持多端同步
  setInterval(() => refreshCreditsFromServer(), 60_000);
}

// ===== 单实例 + 生命周期 =====
// Local smoke tests may run beside an already installed stable client. Keep
// production single-instance behavior unchanged and allow only an explicit
// unpackaged test process to use an isolated user-data directory.
const gotLock = (!app.isPackaged && process.env.QUIZMATE_ALLOW_MULTI_INSTANCE === '1')
  || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => restoreMainWindow());

  app.whenReady().then(async () => {
    // Windows/Linux 移除菜单栏; macOS 保留系统默认菜单(否则文本框的 Cmd+C/V 复制粘贴会失效)
    if (!IS_MAC) Menu.setApplicationMenu(null);
    await initializeApp().catch((e) => {
      console.error('[Main] Init failed:', e);
      createMainWindow();
    });
  });

  app.on('activate', () => restoreMainWindow());

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
    sapiVoiceHelper?.destroy?.();
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
