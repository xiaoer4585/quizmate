import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import type { DesktopConfigHelperOptions } from './platform';
import { toBusinessVersion } from './electron/version';
import type { MacPermissionMigrationRecord, PermissionOnboardingState } from './shared/reliability';

export interface AIModelConfig {
  provider: string;
  note?: string;
  configUrl?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  adminWebUrl?: string;
  websocketUrl: string;
  environment: string;
  version: string;
  registerUrl: string;
  resetPasswordUrl: string;
  rechargeUrl: string;
  tutorialUrl: string;
  allowedExternalHosts: string[];
  creditCostPerSuccess: number;
  creditCostPerInterview: number;
  maxScreenshots: number;
  minScreenshotIntervalMs: number;
  defaultBackgroundOpacity: number;
  defaultTheme: string;
  httpTimeoutMs: number;
  ttsTimeoutMs: number;
  sseConnectTimeoutMs: number;
  screenshotHideDelayMs: number;
  screenshotRestoreDelayMs: number;
  minResolution: { width: number; height: number };
  aiModels?: Record<string, AIModelConfig>;
  windowDefaults: Record<string, number>;
}

export interface UserInfo {
  email: string;
  nickname?: string;
  credits?: number;
  vipLevel?: number;
  [k: string]: unknown;
}

export interface ClientSettings {
  deviceId?: string;
  alwaysOnTop?: boolean;
  shortcut?: string;
  autoAnalyzeAfterCapture?: boolean;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  trainingModeEnabled?: boolean;
  processingMode?: 'overlay' | 'voice';
  theme?: 'dark' | 'light';
  backgroundOpacity?: number;
  zoomFactor?: number;
  /** Hide the main window from taskbar/Dock and remove the tray icon on minimize. */
  hideAppChromeOnMinimize?: boolean;
  [k: string]: unknown;
}

export interface SavedInterviewContext {
  position?: string;
  company?: string;
  jobDescription?: string;
  jobDescriptionHtml?: string;
  answerStyle?: 'concise' | 'detailed';
  audioMode?: 'demo' | 'formal';
  resumeId?: string;
}

export interface UserConfig {
  authToken: string | null;
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  backgroundOpacity: number;
  theme: 'dark' | 'light';
  shortcutBindings: Record<string, string>;
  clientSettings: ClientSettings;
  userInfo?: UserInfo;
}

interface StoreSchema {
  authToken?: string;
  userInfo?: UserInfo;
  clientSettings?: ClientSettings;
  shortcutBindings?: Record<string, string>;
  windowPosition?: { x: number; y: number };
  windowSize?: { width: number; height: number };
  backgroundOpacity?: number;
  theme?: 'dark' | 'light';
  interviewContexts?: Record<string, SavedInterviewContext>;
  onboardingGuideStates?: Record<string, boolean>;
  permissionOnboardingStates?: Record<string, PermissionOnboardingState>;
  macPermissionMigration?: MacPermissionMigrationRecord;
}

export class DesktopConfigHelper {
  private appConfig: AppConfig;
  private store: Store<StoreSchema>;

  constructor(private options: DesktopConfigHelperOptions) {
    this.appConfig = this.loadAppConfig();
    this.store = new Store<StoreSchema>({
      name: 'quizmate-suite',
      defaults: {
        clientSettings: {
          alwaysOnTop: true,
          shortcut: options.defaultShortcut,
          autoAnalyzeAfterCapture: true,
          overlayEnabled: true,
          overlayOpacity: 0.8,
          trainingModeEnabled: false,
          processingMode: 'overlay',
          theme: 'dark',
          backgroundOpacity: 0.8,
          zoomFactor: 1.0,
          hideAppChromeOnMinimize: true,
        },
        shortcutBindings: {},
        backgroundOpacity: 0.8,
        theme: 'dark',
      },
    });
  }

  init(): void {}

  private loadAppConfig(): AppConfig {
    const candidates = [
      path.join(process.resourcesPath || '', 'resources', 'config.json'),
      path.join(app.getAppPath(), 'resources', 'config.json'),
      path.join(__dirname, '..', 'resources', 'config.json'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        /* try next */
      }
    }
    return {
      apiBaseUrl: 'https://api.quizmate.vip/study-auth-api',
      webBaseUrl: 'https://www.quizmate.cn',
      adminWebUrl: 'https://www.quizmate.vip/admin-web/index.html',
      websocketUrl: '',
      environment: 'production',
      version: toBusinessVersion(app.getVersion()),
      registerUrl: 'https://www.quizmate.cn/#credits',
      resetPasswordUrl: 'https://www.quizmate.cn/#credits',
      rechargeUrl: 'https://www.quizmate.cn/recharge.html',
      tutorialUrl: 'https://www.quizmate.cn/',
      allowedExternalHosts: ['quizmate.cn', 'www.quizmate.cn', 'quizmate.vip', 'www.quizmate.vip', 'offer.quizmate.cn'],
      creditCostPerSuccess: 10,
      creditCostPerInterview: 20,
      maxScreenshots: 5,
      minScreenshotIntervalMs: 300,
      defaultBackgroundOpacity: 0.8,
      defaultTheme: 'dark',
      httpTimeoutMs: 60000,
      ttsTimeoutMs: 45000,
      sseConnectTimeoutMs: 30000,
      screenshotHideDelayMs: 300,
      screenshotRestoreDelayMs: 200,
      minResolution: { width: 1280, height: 720 },
      aiModels: {
        examText: { provider: 'server-managed', note: '笔试AI文字模型-由后台统一配置' },
        interviewRealtimeVoice: { provider: 'server-managed', note: '面试实时语音模型-由后台统一配置', configUrl: 'https://www.quizmate.vip/admin-web/index.html#/ai/interview-voice' },
      },
      windowDefaults: { loginWidth: 520, loginHeight: 640, configWidth: 1200, configHeight: 800, overlayWidth: 800, overlayHeight: 600, overlayMinHeight: 40 },
    } as AppConfig;
  }

  getAIModelConfig(key: string): AIModelConfig | undefined {
    return this.appConfig.aiModels?.[key];
  }
  getAllAIModelConfigs(): Record<string, AIModelConfig> {
    return this.appConfig.aiModels || {};
  }
  getAppConfig(): AppConfig {
    return this.appConfig;
  }
  getAuthToken(): string | undefined {
    return this.store.get('authToken');
  }
  setAuthToken(token: string) {
    this.store.set('authToken', token);
  }
  getUserInfo(): UserInfo | undefined {
    return this.store.get('userInfo');
  }
  setUserInfo(info: UserInfo) {
    this.store.set('userInfo', info);
  }
  clearAuth() {
    this.store.delete('authToken');
    this.store.delete('userInfo');
  }
  getClientSettings(): ClientSettings {
    return this.store.get('clientSettings') || {};
  }
  updateClientSettings(patch: Partial<ClientSettings>) {
    this.store.set('clientSettings', { ...this.getClientSettings(), ...patch });
  }
  getInterviewAccountScope(): string {
    const email = String(this.getUserInfo()?.email ?? '').trim().toLowerCase();
    return email || '__anonymous__';
  }
  getInterviewContext(): SavedInterviewContext {
    const contexts = this.store.get('interviewContexts') || {};
    return { ...(contexts[this.getInterviewAccountScope()] || {}) };
  }
  setInterviewContext(context: SavedInterviewContext): SavedInterviewContext {
    const current = this.getInterviewContext();
    const next: SavedInterviewContext = {
      ...current,
      position: String(context.position ?? current.position ?? '').trim().slice(0, 100),
      company: String(context.company ?? current.company ?? '').trim().slice(0, 100),
      jobDescription: String(context.jobDescription ?? current.jobDescription ?? '').trim().slice(0, 8_000),
      jobDescriptionHtml: String(context.jobDescriptionHtml ?? current.jobDescriptionHtml ?? '').slice(0, 16_000),
      answerStyle: context.answerStyle === 'detailed' ? 'detailed' : 'concise',
      audioMode: context.audioMode === 'formal' ? 'formal' : 'demo',
      ...(context.resumeId ? { resumeId: String(context.resumeId).slice(0, 200) } : {}),
    };
    const contexts = this.store.get('interviewContexts') || {};
    this.store.set('interviewContexts', { ...contexts, [this.getInterviewAccountScope()]: next });
    return next;
  }
  getOnboardingGuideState(): { completed: boolean } {
    const states = this.store.get('onboardingGuideStates') || {};
    return { completed: states[this.getInterviewAccountScope()] === true };
  }
  setOnboardingGuideCompleted(completed = true): { completed: boolean } {
    const states = this.store.get('onboardingGuideStates') || {};
    this.store.set('onboardingGuideStates', { ...states, [this.getInterviewAccountScope()]: Boolean(completed) });
    return this.getOnboardingGuideState();
  }
  getPermissionOnboardingState(): PermissionOnboardingState | undefined {
    const states = this.store.get('permissionOnboardingStates') || {};
    const state = states[this.getInterviewAccountScope()];
    return state ? { ...state } : undefined;
  }
  setPermissionOnboardingState(state: PermissionOnboardingState): PermissionOnboardingState {
    const states = this.store.get('permissionOnboardingStates') || {};
    const next = { ...state, updatedAt: Date.now() };
    this.store.set('permissionOnboardingStates', { ...states, [this.getInterviewAccountScope()]: next });
    return next;
  }
  resetPermissionOnboardingStates(): void {
    this.store.set('permissionOnboardingStates', {});
  }
  getMacPermissionMigration(): MacPermissionMigrationRecord | undefined {
    const record = this.store.get('macPermissionMigration');
    return record ? { ...record } : undefined;
  }
  setMacPermissionMigration(record: MacPermissionMigrationRecord): MacPermissionMigrationRecord {
    const next = { ...record, updatedAt: Date.now() };
    this.store.set('macPermissionMigration', next);
    return next;
  }
  getUserConfig(): UserConfig {
    const cs = this.getClientSettings();
    return {
      authToken: this.getAuthToken() || null,
      windowPosition: this.store.get('windowPosition') || null,
      windowSize: this.store.get('windowSize') || null,
      backgroundOpacity: this.store.get('backgroundOpacity') ?? 0.8,
      theme: this.store.get('theme') || 'dark',
      shortcutBindings: this.store.get('shortcutBindings') || {},
      clientSettings: cs,
      userInfo: this.getUserInfo(),
    };
  }
  getShortcutBindings(): Record<string, string> {
    return this.store.get('shortcutBindings') || {};
  }
  setShortcutBindings(bindings: Record<string, string>) {
    this.store.set('shortcutBindings', bindings);
  }
  getProcessingMode(): 'overlay' | 'voice' {
    return this.getClientSettings().processingMode || 'overlay';
  }
  setProcessingMode(mode: 'overlay' | 'voice') {
    this.updateClientSettings({ processingMode: mode });
  }
  getBackgroundOpacity(): number {
    return this.store.get('backgroundOpacity') ?? this.appConfig.defaultBackgroundOpacity ?? 0.8;
  }
  setBackgroundOpacity(opacity: number) {
    this.store.set('backgroundOpacity', opacity);
  }
  getTheme(): 'dark' | 'light' {
    return (this.store.get('theme') as 'dark' | 'light') || 'dark';
  }
  setTheme(theme: 'dark' | 'light') {
    this.store.set('theme', theme);
  }
  getWindowPosition(): { x: number; y: number } | null {
    return this.store.get('windowPosition') || null;
  }
  setWindowPosition(pos: { x: number; y: number }) {
    this.store.set('windowPosition', pos);
  }
  getWindowSize(): { width: number; height: number } | null {
    return this.store.get('windowSize') || null;
  }
  setWindowSize(size: { width: number; height: number }) {
    this.store.set('windowSize', size);
  }
}

