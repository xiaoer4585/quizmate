// IPC 路由 - 注册所有渲染层调用的 handler，分发到各 Helper
import { ipcMain, shell, app, BrowserWindow, dialog, session, clipboard, systemPreferences } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigHelper } from './ConfigHelper';
import { AuthManager } from './AuthManager';
import { ScreenshotHelper } from './helpers/ScreenshotHelper';
import { LightweightProcessingHelper } from './helpers/ProcessingHelper';
import { ShortcutsHelper } from './ShortcutsHelper';
import { TtsHelper } from './helpers/TtsHelper';
import { InterviewHelper } from './helpers/InterviewHelper';
import { UpdateChecker } from './UpdateChecker';
import type { ProcessingMode } from '../shared/shortcuts';
import { v4 as uuid } from 'uuid';

export interface AppContext {
  configHelper: ConfigHelper;
  authManager: AuthManager | null;
  screenshot: ScreenshotHelper | null;
  processing: LightweightProcessingHelper | null;
  shortcuts: ShortcutsHelper | null;
  tts: TtsHelper | null;
  interview: InterviewHelper | null;
  updateChecker: UpdateChecker | null;
}

export interface OverlayControls {
  createOverlayWindow: () => void;
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
  moveOverlay: (dx: number, dy: number) => void;
  resizeOverlay: (dw: number, dh: number) => void;
  setWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  getWindowBounds: () => { x: number; y: number; width: number; height: number } | null;
  resetWindowPosition: () => void;
  setBackgroundOpacity: (opacity: number) => void;
  setZoomFactor: (factor: number) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setIgnoreMouseEvents: (ignore: boolean) => void;
  minimizeWindow: (which: 'main' | 'overlay') => void;
  maximizeWindow: (which: 'main' | 'overlay') => void;
  closeWindow: (which: 'main' | 'overlay') => void;
  handleScreenshot: (isExtra: boolean) => Promise<boolean>;
  handleSearchAction: (mode: ProcessingMode) => Promise<void>;
  launchExamClient: () => Promise<{ success: boolean; error?: string }>;
  closeExamClient: () => Promise<void>;
  switchProcessingMode: (mode: 'overlay' | 'voice') => Promise<void>;
  startShortcutTest: () => void;
  cancelShortcutTest: () => void;
  shortcutsHelper: ShortcutsHelper;
  openEmbeddedWindow: (kind: 'recharge' | 'register') => void;
  toggleInterviewSession: (context?: unknown) => Promise<{ listening: boolean; overlay: boolean }>;
}

export function registerIpcHandlers(
  ctx: AppContext,
  getMainWindow: () => BrowserWindow | null,
  getOverlayWindow: () => BrowserWindow | null,
  controls: OverlayControls
) {
  // ===== 认证 =====
  ipcMain.handle('auth:login', (_e, email: string, password: string) => ctx.authManager!.login(email, password));
  ipcMain.handle('auth:sendRegisterCode', (_e, email: string) => ctx.authManager!.sendRegisterCode(email));
  ipcMain.handle('auth:register', (_e, email: string, code: string, password: string, inviteCode?: string) => ctx.authManager!.register(email, code, password, inviteCode));
  ipcMain.handle('auth:logout', () => ctx.authManager!.logout());
  ipcMain.handle('auth:getProfile', () => ctx.authManager!.getProfile());
  ipcMain.handle('auth:isAuthenticated', () => ctx.authManager!.isAuthenticated());

  // ===== 配置 =====
  ipcMain.handle('config:get', () => ctx.configHelper.getAppConfig());
  ipcMain.handle('config:getClientSettings', () => ctx.configHelper.getClientSettings());
  ipcMain.handle('config:updateClientSettings', (_e, patch) => {
    ctx.configHelper.updateClientSettings(patch);
    return ctx.configHelper.getClientSettings();
  });
  ipcMain.handle('guide:getState', () => ctx.configHelper.getOnboardingGuideState());
  ipcMain.handle('guide:setCompleted', (_e, completed?: boolean) => ctx.configHelper.setOnboardingGuideCompleted(completed !== false));

  // ===== 笔试助手 =====
  ipcMain.handle('exam:captureAndAnalyze', async () => {
    // 截图 + 分析一体化流程
    const captured = await controls.handleScreenshot(false);
    if (!captured) return { success: false };
    await controls.handleSearchAction(ctx.configHelper.getProcessingMode());
    return { success: true };
  });
  ipcMain.handle('exam:screenshot', async () => ({ success: await controls.handleScreenshot(false) }));
  ipcMain.handle('exam:search', async () => { await controls.handleSearchAction(ctx.configHelper.getProcessingMode()); });
  ipcMain.handle('exam:stopAnalyze', () => ctx.processing!.cancelStreaming());
  ipcMain.handle('exam:setTrainingMode', (_e, enabled: boolean) => {
    ctx.configHelper.updateClientSettings({ trainingModeEnabled: enabled });
  });
  ipcMain.handle('exam:checkCredits', () => ctx.processing!.checkCredits());

  // ===== 快捷键 =====
  ipcMain.handle('shortcuts:getBindings', () => controls.shortcutsHelper.getBindings());
  ipcMain.handle('shortcuts:setBinding', (_e, action: string, accelerator: string) => {
    const updated = controls.shortcutsHelper.setBinding(action as any, accelerator);
    if (updated) {
      controls.shortcutsHelper.refreshCurrentRegistration();
      const bindings = controls.shortcutsHelper.getBindings();
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('shortcuts:updated', bindings));
    }
    return updated;
  });
  ipcMain.handle('shortcuts:resetBinding', (_e, action: string) => {
    controls.shortcutsHelper.resetBinding(action as any);
    controls.shortcutsHelper.refreshCurrentRegistration();
    const bindings = controls.shortcutsHelper.getBindings();
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('shortcuts:updated', bindings));
  });
  ipcMain.handle('shortcuts:resetAll', () => {
    controls.shortcutsHelper.resetAll();
    controls.shortcutsHelper.refreshCurrentRegistration();
    const bindings = controls.shortcutsHelper.getBindings();
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('shortcuts:updated', bindings));
  });
  ipcMain.handle('shortcuts:checkConflict', (_e, accelerator: string, excludeAction?: string) =>
    controls.shortcutsHelper.checkConflict(accelerator, excludeAction as any));

  // 暂停/恢复全局快捷键（快捷键捕获时暂停，避免拦截按键事件）
  ipcMain.handle('config:pauseGlobalShortcuts', () => {
    controls.shortcutsHelper.pauseAll();
    return true;
  });
  ipcMain.handle('config:resumeGlobalShortcuts', () => {
    controls.shortcutsHelper.resumeAll();
    return true;
  });

  // ===== 悬浮窗控制 =====
  ipcMain.handle('overlay:create', () => controls.createOverlayWindow());
  ipcMain.handle('overlay:show', () => controls.showOverlay());
  ipcMain.handle('overlay:hide', () => controls.hideOverlay());
  ipcMain.handle('overlay:toggle', () => controls.toggleOverlay());
  ipcMain.handle('overlay:setOpacity', (_e, opacity: number) => controls.setBackgroundOpacity(opacity));
  ipcMain.handle('overlay:zoom', (_e, factor: number) => controls.setZoomFactor(factor));
  ipcMain.handle('overlay:setBounds', (_e, bounds) => controls.setWindowBounds(bounds));
  ipcMain.handle('overlay:getBounds', () => controls.getWindowBounds());
  ipcMain.handle('overlay:resetPosition', () => controls.resetWindowPosition());
  ipcMain.handle('overlay:setTheme', (_e, theme) => controls.setTheme(theme));
  ipcMain.handle('overlay:setIgnoreMouseEvents', (_e, ignore: boolean) => controls.setIgnoreMouseEvents(ignore));
  ipcMain.handle('overlay:minimize', (_e, which) => controls.minimizeWindow(which));
  ipcMain.handle('overlay:maximize', (_e, which) => controls.maximizeWindow(which));
  ipcMain.handle('overlay:close', (_e, which) => controls.closeWindow(which));

  // ===== 考试客户端生命周期（完全沿用原考试插件） =====
  ipcMain.handle('exam:launch', () => controls.launchExamClient());
  ipcMain.handle('exam:close', () => controls.closeExamClient());
  ipcMain.handle('exam:switchMode', (_e, mode) => controls.switchProcessingMode(mode));
  ipcMain.handle('exam:startShortcutTest', () => controls.startShortcutTest());
  ipcMain.handle('exam:cancelShortcutTest', () => controls.cancelShortcutTest());
  ipcMain.handle('exam:getProcessingMode', () => ctx.configHelper.getProcessingMode());

  // ===== 面试助手 =====
  ipcMain.handle('interview:start', (_e, context?) => ctx.interview!.start(context));
  ipcMain.handle('interview:restart', (_e, context?) => ctx.interview!.restart(context));
  ipcMain.handle('interview:stop', () => ctx.interview!.stop());
  ipcMain.handle('interview:toggle', (_e, context?) => controls.toggleInterviewSession(context));
  ipcMain.handle('interview:activateShortcuts', () => { controls.shortcutsHelper.registerGlobalShortcutsForMode('interview'); return true; });
  ipcMain.handle('interview:deactivateShortcuts', () => { controls.shortcutsHelper.registerGlobalShortcutsForMode(ctx.configHelper.getProcessingMode()); return true; });
  ipcMain.handle('interview:setContext', (_e, context) => ctx.interview!.setContext(context));
  ipcMain.handle('interview:getContext', () => ctx.interview!.getContext());
  ipcMain.handle('interview:saveContext', (_e, context) => ctx.interview!.saveContext(context));
  ipcMain.handle('interview:transcript', (_e, text: string) => ctx.interview!.onTranscript(text));
  ipcMain.handle('interview:generateAnswer', (_e, question: string) => ctx.interview!.generateAnswer(question));
  // 简历管理
  ipcMain.handle('interview:listResumes', () => ctx.interview!.listResumes());
  ipcMain.handle('interview:saveResume', (_e, payload: { id?: string; name?: string; text?: string }) => {
    const text = String(payload?.text ?? '').trim();
    if (!text) throw new Error('请先粘贴简历内容');
    if (text.length > 30_000) throw new Error('简历内容不能超过 30000 字');
    const id = String(payload?.id || uuid());
    const name = String(payload?.name || '我的简历').trim().slice(0, 100) || '我的简历';
    const resume = ctx.interview!.addResume(id, name, text);
    ctx.interview!.setActiveResume(id);
    return resume;
  });
  ipcMain.handle('interview:pickResumeFile', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择面试简历',
      filters: [{ name: '简历', extensions: ['txt', 'md', 'pdf', 'doc', 'docx'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('interview:uploadResume', async (_e, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      let text = '';
      if (ext === '.txt') {
        text = fs.readFileSync(filePath, 'utf8');
      } else if (ext === '.md') {
        text = fs.readFileSync(filePath, 'utf8');
      } else if (ext === '.pdf') {
        // PDF 简单提取：调用后端转换或本地 pdfjs（这里先读取为占位，实际转换由后端处理）
        text = `[PDF简历:${name}-需后端解析]`;
      } else if (ext === '.doc' || ext === '.docx') {
        text = `[Word简历:${name}-需后端解析]`;
      } else {
        text = fs.readFileSync(filePath, 'utf8');
      }
      const id = uuid();
      return ctx.interview!.addResume(id, name, text);
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
  ipcMain.handle('interview:deleteResume', (_e, id: string) => { ctx.interview!.deleteResume(id); return true; });
  ipcMain.handle('interview:setActiveResume', (_e, id: string | null) => { ctx.interview!.setActiveResume(id); return true; });
  ipcMain.handle('interview:getActiveResume', () => ctx.interview!.getActiveResume());
  // 任务列表
  ipcMain.handle('interview:getTasks', () => ctx.interview!.getTasks());
  ipcMain.handle('interview:clearTasks', () => { ctx.interview!.clearTasks(); return true; });
  // 实时语音模型配置
  ipcMain.handle('interview:getVoiceConfig', () => ctx.interview!.getRealtimeVoiceConfig());

  // ===== 系统/外链 =====
  ipcMain.handle('system:openExternal', (_e, url: string) => {
    const allowed = ctx.configHelper.getAppConfig().allowedExternalHosts;
    if (allowed.some((h) => { try { return new URL(url).hostname.endsWith(h); } catch { return false; } })) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.handle('system:openRecharge', () => controls.openEmbeddedWindow('recharge'));

  ipcMain.handle('system:openWeb', () => shell.openExternal(ctx.configHelper.getAppConfig().webBaseUrl));
  ipcMain.handle('system:openAdmin', () => shell.openExternal(ctx.configHelper.getAppConfig().adminWebUrl || 'https://www.quizmate.vip/admin-web/index.html'));
  ipcMain.handle('system:version', () => app.getVersion());
  ipcMain.handle('system:getPermissions', () => ({
    screen: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
    microphone: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted',
  }));
  ipcMain.handle('system:requestMicrophone', async () => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });
  ipcMain.handle('system:openPermissionSettings', (_e, kind: 'screen' | 'microphone') => {
    const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Microphone';
    return shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  });
  ipcMain.handle('system:getAIConfigs', () => ctx.configHelper.getAllAIModelConfigs());

  // ===== 邀请代理 / 面经图片保存分享 =====
  ipcMain.handle('invite:generate-code', async () => {
    if (!ctx.processing) return { success: false, error: '处理模块未初始化' };
    return await (ctx.processing as any).generateInviteCode?.() ?? { success: false, error: '不支持' };
  });
  ipcMain.handle('invite:get-overview', async () => {
    if (!ctx.processing) return { success: false, error: '处理模块未初始化' };
    return await (ctx.processing as any).getReferralOverview?.() ?? { success: false, error: '不支持' };
  });
  // 保存海报/面经图片到本地（弹出系统保存对话框）
  ipcMain.handle('invite:save-poster', async (_e, dataUrl: string) => {
    try {
      const win = getMainWindow() || undefined;
      const result = await dialog.showSaveDialog(win as any, {
        title: '保存图片',
        defaultPath: `QuizMate-${Date.now()}.png`,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (!result.canceled && result.filePath) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
        return { success: true, path: result.filePath };
      }
      return { success: false, canceled: true };
    } catch (e: any) {
      return { success: false, error: e instanceof Error ? e.message : '保存失败' };
    }
  });
  // 分享海报/面经图片（保存到临时目录后用系统默认图片查看器打开）
  ipcMain.handle('invite:share-poster', async (_e, dataUrl: string) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const tempDir = app.getPath('temp');
      const filePath = path.join(tempDir, `QuizMate-${Date.now()}.png`);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      await shell.openPath(filePath);
      return { success: true, path: filePath };
    } catch (e: any) {
      return { success: false, error: e instanceof Error ? e.message : '分享失败' };
    }
  });

  // ===== electronAPI 兼容层 IPC（原考试插件笔试功能所需）=====

  // 截图队列管理
  ipcMain.handle('screenshot:capture-full', async () => {
    if (!ctx.screenshot) return { error: '截图模块未初始化' };
    try {
      const result = await ctx.screenshot.captureFullScreen();
      return result;
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle('screenshot:get-queue', (_e, isExtra?: boolean) => {
    return ctx.screenshot?.getQueue(!!isExtra) ?? [];
  });
  ipcMain.handle('screenshot:delete-latest', (_e, isExtra?: boolean) => {
    return ctx.screenshot?.deleteLatest(!!isExtra) ?? false;
  });
  ipcMain.handle('screenshot:clear-all', () => {
    ctx.screenshot?.clearAll();
    return true;
  });
  ipcMain.handle('screenshot:file-to-base64', async (_e, filePath: string) => {
    if (!ctx.screenshot || !filePath) return '';
    try {
      return await ctx.screenshot.fileToBase64(filePath);
    } catch {
      return '';
    }
  });

  // 积分（映射到秋招助手 AuthManager 积分系统）
  ipcMain.handle('credits:check', async () => {
    if (!ctx.authManager) return { available: 0 };
    try {
      const profile = await ctx.authManager.getProfile();
      const credits = (profile as any)?.creditBalance ?? (profile as any)?.account?.credits ?? 0;
      return { available: credits };
    } catch {
      return { available: 0 };
    }
  });
  ipcMain.handle('credits:deduct', async (_e, amount?: number) => {
    // 积分扣除由 ProcessingHelper 在 AI 分析成功时自动完成，此处仅返回当前余额
    const profile = await ctx.authManager?.getProfile().catch(() => null);
    const credits = (profile as any)?.creditBalance ?? (profile as any)?.account?.credits ?? 0;
    return { success: true, available: credits };
  });
  ipcMain.handle('credits:refund', async (_e, amount?: number) => {
    // 积分退还在 ProcessingHelper 错误处理中自动完成，此处仅返回当前余额
    const profile = await ctx.authManager?.getProfile().catch(() => null);
    const credits = (profile as any)?.creditBalance ?? (profile as any)?.account?.credits ?? 0;
    return { success: true, available: credits };
  });

  // 剪贴板
  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle('clipboard:read-text', () => clipboard.readText());

  // TTS 语音（映射到 TtsHelper）
  ipcMain.handle('tts:speak', async (_e, text: string) => {
    if (!ctx.tts) return { success: false, error: 'TTS 未初始化' };
    return await ctx.tts.speak(text);
  });
  ipcMain.handle('tts:cancel', () => {
    ctx.tts?.cancel();
    return true;
  });
  ipcMain.handle('tts:is-busy', () => {
    return ctx.tts?.isBusy() ?? false;
  });

  // 对话框
  ipcMain.handle('dialog:confirm', async (_e, message: string, title?: string) => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['确定', '取消'],
      defaultId: 0,
      cancelId: 1,
      title: title || '确认',
      message: message,
    });
    return result.response === 0;
  });

  // TTS 偏好设置（简化实现，存储在 clientSettings 中）
  ipcMain.handle('config:getTtsPreferences', () => {
    const settings = ctx.configHelper.getClientSettings();
    return (settings as any).ttsPreferences || { rate: 100, volume: 100, voice: '' };
  });
  ipcMain.handle('config:updateTtsPreferences', (_e, prefs: any) => {
    const settings = ctx.configHelper.getClientSettings();
    ctx.configHelper.updateClientSettings({ ttsPreferences: { ...(settings as any).ttsPreferences, ...prefs } });
    return true;
  });

  // ===== 客户端版本更新检测 =====
  // 获取当前更新状态
  ipcMain.handle('update:status', () => ctx.updateChecker?.getStatus() ?? null);
  // 手动触发检测最新版本
  ipcMain.handle('update:check', () => ctx.updateChecker?.checkForUpdates());
  // 下载更新包（electron-updater 自动选择当前平台/架构对应的安装包）
  ipcMain.handle('update:download', () => ctx.updateChecker?.downloadUpdate());
  // 安装更新（关闭应用并启动安装程序）
  ipcMain.handle('update:install', () => { ctx.updateChecker?.installUpdate(); return true; });

  // 应用更新检查（兼容 electronAPI.app.checkUpdate 旧接口）
  ipcMain.handle('app:check-update', async () => {
    if (!ctx.updateChecker) return { hasUpdate: false, current: app.getVersion(), latest: app.getVersion() };
    const status = await ctx.updateChecker.checkForUpdates();
    return {
      hasUpdate: status.status === 'available',
      current: status.currentVersion,
      latest: status.version ?? status.currentVersion,
      status,
    };
  });
}
