// 预加载脚本 - 通过 contextBridge 向渲染层暴露受控 API
import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const on = (channel: string, cb: (...args: unknown[]) => void) => {
  const listener = (_e: unknown, ...args: unknown[]) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api = {
  // 认证
  auth: {
    login: (email: string, password: string) => invoke('auth:login', email, password),
    sendRegisterCode: (email: string) => invoke('auth:sendRegisterCode', email),
    register: (email: string, code: string, password: string, inviteCode?: string) => invoke('auth:register', email, code, password, inviteCode),
    logout: () => invoke('auth:logout'),
    getProfile: () => invoke('auth:getProfile'),
    isAuthenticated: () => invoke('auth:isAuthenticated'),
    onRequireLogin: (cb: () => void) => on('auth:require-login', cb),
  },
  // 配置
  config: {
    get: () => invoke('config:get'),
    getClientSettings: () => invoke('config:getClientSettings'),
    updateClientSettings: (patch: Record<string, unknown>) => invoke('config:updateClientSettings', patch),
    pauseGlobalShortcuts: () => invoke('config:pauseGlobalShortcuts'),
    resumeGlobalShortcuts: () => invoke('config:resumeGlobalShortcuts'),
  },
  guide: {
    getState: () => invoke('guide:getState'),
    setCompleted: (completed = true) => invoke('guide:setCompleted', completed),
  },
  // 笔试助手（完全沿用原考试插件方案）
  exam: {
    // 截图 + 搜题（兼容旧接口）
    captureAndAnalyze: () => invoke('exam:captureAndAnalyze'),
    screenshot: () => invoke('exam:screenshot'),
    search: () => invoke('exam:search'),
    stopAnalyze: () => invoke('exam:stopAnalyze'),
    setTrainingMode: (enabled: boolean) => invoke('exam:setTrainingMode', enabled),
    checkCredits: () => invoke('exam:checkCredits'),
    // 考试客户端生命周期（沿用原考试插件）
    launch: () => invoke('exam:launch'),
    close: () => invoke('exam:close'),
    isActive: () => invoke('exam:isActive'),
    switchMode: (mode: 'overlay' | 'voice') => invoke('exam:switchMode', mode),
    getProcessingMode: () => invoke('exam:getProcessingMode'),
    // 快捷键测试
    startShortcutTest: () => invoke('exam:startShortcutTest'),
    cancelShortcutTest: () => invoke('exam:cancelShortcutTest'),
    // 快捷键绑定
    getShortcutBindings: () => invoke('shortcuts:getBindings'),
    setShortcutBinding: (action: string, accelerator: string) => invoke('shortcuts:setBinding', action, accelerator),
    resetShortcutBinding: (action: string) => invoke('shortcuts:resetBinding', action),
    resetAllShortcuts: () => invoke('shortcuts:resetAll'),
    checkShortcutConflict: (accelerator: string, excludeAction?: string) => invoke('shortcuts:checkConflict', accelerator, excludeAction),
    // 事件
    onResult: (cb: (data: unknown) => void) => on('exam:result', cb),
    onProgress: (cb: (data: unknown) => void) => on('exam:progress', cb),
    onError: (cb: (data: unknown) => void) => on('exam:error', cb),
    onProcessingModeChanged: (cb: (data: unknown) => void) => on('processing-mode-changed', cb),
    onShortcutTest: (cb: (data: unknown) => void) => on('shortcut-test', cb),
    onShortcutChanged: (cb: (data: unknown) => void) => on('shortcut-changed', cb),
    onTrayBusy: (cb: (data: unknown) => void) => on('tray:busy', cb),
  },
  // 面试助手
  interview: {
    startListening: (context?: unknown) => invoke('interview:start', context),
    restartListening: (context?: unknown) => invoke('interview:restart', context),
    stopListening: () => invoke('interview:stop'),
    toggleListening: () => invoke('interview:toggle'),
    activateShortcuts: () => invoke('interview:activateShortcuts'),
    deactivateShortcuts: () => invoke('interview:deactivateShortcuts'),
    setContext: (context: unknown) => invoke('interview:setContext', context),
    getContext: () => invoke('interview:getContext'),
    saveContext: (context: unknown) => invoke('interview:saveContext', context),
    transcript: (text: string) => invoke('interview:transcript', text),
    // 简历管理
    listResumes: () => invoke('interview:listResumes'),
    saveResume: (payload: { id?: string; name?: string; text?: string }) => invoke('interview:saveResume', payload),
    pickResumeFile: () => invoke('interview:pickResumeFile'),
    uploadResume: (filePath: string) => invoke('interview:uploadResume', filePath),
    deleteResume: (id: string) => invoke('interview:deleteResume', id),
    setActiveResume: (id: string | null) => invoke('interview:setActiveResume', id),
    getActiveResume: () => invoke('interview:getActiveResume'),
    // 任务列表
    getTasks: () => invoke('interview:getTasks'),
    clearTasks: () => invoke('interview:clearTasks'),
    generateAnswer: (question: string) => invoke('interview:generateAnswer', question),
    // 实时语音模型配置
    getVoiceConfig: () => invoke('interview:getVoiceConfig'),
    // 面试悬浮窗控制（独立于笔试悬浮窗）
    createOverlay: () => invoke('interview-overlay:create'),
    showOverlay: () => invoke('interview-overlay:show'),
    hideOverlay: () => invoke('interview-overlay:hide'),
    closeOverlay: () => invoke('interview-overlay:close'),
    isOverlayActive: () => invoke('interview-overlay:isActive'),
    // 面经图片保存/分享
    savePoster: (dataUrl: string) => invoke('invite:save-poster', dataUrl),
    sharePoster: (dataUrl: string) => invoke('invite:share-poster', dataUrl),
    onTranscript: (cb: (data: unknown) => void) => on('interview:transcript', cb),
    onAnswer: (cb: (data: unknown) => void) => on('interview:answer', cb),
    onTaskAdded: (cb: (data: unknown) => void) => on('interview:taskAdded', cb),
    onTaskUpdated: (cb: (data: unknown) => void) => on('interview:taskUpdated', cb),
    onTasksCleared: (cb: (data: unknown) => void) => on('interview:tasksCleared', cb),
  },
  // 系统/外链
  system: {
    openExternal: (url: string) => invoke('system:openExternal', url),
    openRecharge: () => invoke('system:openRecharge'),
    openWeb: () => invoke('system:openWeb'),
    openAdmin: () => invoke('system:openAdmin'),
    getAIConfigs: () => invoke('system:getAIConfigs'),
    getAppVersion: () => invoke('system:version'),
    onShowRechargeModal: (cb: () => void) => on('system:showRechargeModal', cb),
  },
  // 支付
  payment: {
    createOrder: (opts: { method: 'alipay' | 'wechat'; packageId: string }) =>
      invoke('payment:createOrder', opts),
    queryOrder: (outTradeNo: string) => invoke('payment:queryOrder', outTradeNo),
  },
  // 邀请代理
  invite: {
    generateCode: () => invoke('invite:generate-code'),
    savePoster: (dataUrl: string) => invoke('invite:save-poster', dataUrl),
    sharePoster: (dataUrl: string) => invoke('invite:share-poster', dataUrl),
  },
  // 客户端版本更新检测
  update: {
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    getStatus: () => invoke('update:status'),
    onStatus: (cb: (status: unknown) => void) => on('update:status', cb),
  },
  // 通用事件监听（TTS 等）
  onListen: (channel: string, cb: (...args: unknown[]) => void) => on(channel, cb),
};

// ===== electronAPI 兼容层：完全沿用原考试插件的 preload 接口结构 =====
// 原考试插件的 OverlayPage / ConfigPage 通过 window.electronAPI 调用后端
// 此兼容层将这些调用映射到秋招助手的 IPC 通道，UI 代码无需修改
const electronAPI = {
  // Config（映射到秋招助手的 config / shortcuts / exam 通道）
  config: {
    getAppConfig: () => invoke('config:get'),
    getClientSettings: () => invoke('config:getClientSettings'),
    updateClientSettings: (settings: any) => invoke('config:updateClientSettings', settings),
    getShortcutBindings: () => invoke('shortcuts:getBindings'),
    setShortcutBinding: (action: any, accelerator: string) => invoke('shortcuts:setBinding', action, accelerator),
    resetShortcutBinding: (action: any) => invoke('shortcuts:resetBinding', action),
    resetAllShortcuts: () => invoke('shortcuts:resetAll'),
    checkShortcutConflict: (accelerator: string, excludeAction?: any) => invoke('shortcuts:checkConflict', accelerator, excludeAction),
    pauseGlobalShortcuts: () => invoke('config:pauseGlobalShortcuts'),
    resumeGlobalShortcuts: () => invoke('config:resumeGlobalShortcuts'),
    getProcessingMode: () => invoke('exam:getProcessingMode'),
    setProcessingMode: (mode: 'overlay' | 'voice') => invoke('exam:switchMode', mode),
    getTtsPreferences: () => invoke('config:getTtsPreferences'),
    updateTtsPreferences: (prefs: any) => invoke('config:updateTtsPreferences', prefs),
  },
  // Auth
  auth: {
    fetchUserInfo: () => invoke('auth:getProfile'),
    logout: () => invoke('auth:logout'),
    isAuthenticated: () => invoke('auth:isAuthenticated'),
  },
  // Credits（映射到秋招助手的积分系统）
  credits: {
    check: () => invoke('credits:check'),
    deduct: (amount?: number) => invoke('credits:deduct', amount),
    refund: (amount?: number) => invoke('credits:refund', amount),
  },
  // Screenshot（笔试截图队列管理）
  screenshot: {
    captureFull: () => invoke('screenshot:capture-full'),
    getQueue: (isExtra?: boolean) => invoke('screenshot:get-queue', isExtra),
    deleteLatest: (isExtra?: boolean) => invoke('screenshot:delete-latest', isExtra),
    clearAll: () => invoke('screenshot:clear-all'),
    fileToBase64: (filePath: string) => invoke('screenshot:file-to-base64', filePath),
  },
  // Window（悬浮窗控制）
  window: {
    show: () => invoke('overlay:show'),
    hide: () => invoke('overlay:hide'),
    toggle: () => invoke('overlay:toggle'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => invoke('overlay:setBounds', bounds),
    getBounds: () => invoke('overlay:getBounds'),
    setOpacity: (opacity: number) => invoke('overlay:setOpacity', opacity),
    setIgnoreMouseEvents: (ignore: boolean) => invoke('overlay:setIgnoreMouseEvents', ignore),
    setTheme: (theme: 'dark' | 'light') => invoke('overlay:setTheme', theme),
  },
  // App
  app: {
    launchExamClient: () => invoke('exam:launch'),
    closeExamClient: () => invoke('exam:close'),
    isExamClientActive: () => invoke('exam:isActive'),
    switchMode: (mode: 'overlay' | 'voice') => invoke('exam:switchMode', mode),
    getVersion: () => invoke('system:version'),
    openExternal: (url: string) => invoke('system:openExternal', url),
    checkUpdate: () => invoke('app:check-update'),
  },
  // TTS
  tts: {
    speak: (text: string) => invoke('tts:speak'),
    cancel: () => invoke('tts:cancel'),
    isBusy: () => invoke('tts:is-busy'),
  },
  // Dialog
  dialog: {
    confirm: (message: string, title?: string) => invoke('dialog:confirm', message, title),
  },
  // Clipboard
  clipboard: {
    writeText: (text: string) => invoke('clipboard:write-text', text),
    readText: () => invoke('clipboard:read-text'),
  },
  // 通用事件监听（原考试插件用 api.on(channel, cb) 订阅事件）
  on: (channel: string, callback: (...args: any[]) => void) => {
    const wrapper = (_e: unknown, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, wrapper);
    return () => { ipcRenderer.removeListener(channel, wrapper); };
  },
  once: (channel: string, callback: (...args: any[]) => void) => {
    const wrapper = (_e: unknown, ...args: any[]) => callback(...args);
    ipcRenderer.once(channel, wrapper);
    return () => { ipcRenderer.removeListener(channel, wrapper); };
  },
  removeAllListeners: (channel: string) => { ipcRenderer.removeAllListeners(channel); },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type AppApi = typeof api;
export type ElectronAPI = typeof electronAPI;
