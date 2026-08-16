// 配置管理 —— 读取 resources/config.json，持久化 token / userInfo / clientSettings / 快捷键 / 窗口状态
// 兼容原考试插件的 ConfigHelper API，确保 ProcessingHelper / ShortcutsHelper / main.ts 可直接使用
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';

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
  [k: string]: unknown;
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
}

export class ConfigHelper {
  private appConfig: AppConfig;
  private store: Store<StoreSchema>;

  constructor() {
    this.appConfig = this.loadAppConfig();
    this.store = new Store<StoreSchema>({
      name: 'quizmate-suite',
      defaults: {
        clientSettings: {
          alwaysOnTop: true,
          shortcut: 'Command+Shift+F5',
          autoAnalyzeAfterCapture: true,
          overlayEnabled: true,
          overlayOpacity: 0.8,
          trainingModeEnabled: false,
          processingMode: 'overlay',
          theme: 'dark',
          backgroundOpacity: 0.8,
          zoomFactor: 1.0,
        },
        shortcutBindings: {},
        backgroundOpacity: 0.8,
        theme: 'dark',
      },
    });
  }

  /** 初始化（兼容原考试插件 API） */
  init(): void {
    // electron-store 自动加载，无需额外操作
  }

  private loadAppConfig(): AppConfig {
    const candidates = [
      path.join(process.resourcesPath || '', 'resources', 'config.json'),
      path.join(app.getAppPath(), 'resources', 'config.json'),
      path.join(__dirname, '..', 'resources', 'config.json'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch {
        /* try next */
      }
    }
    return {
      apiBaseUrl: 'https://api.quizmate.vip/study-auth-api',
      webBaseUrl: 'https://www.quizmate.vip',
      adminWebUrl: 'https://www.quizmate.vip/admin-web/index.html',
      websocketUrl: '',
      environment: 'production',
      version: app.getVersion(),
      registerUrl: 'https://www.quizmate.vip/#credits',
      resetPasswordUrl: 'https://www.quizmate.vip/#credits',
      rechargeUrl: 'https://www.quizmate.vip/recharge.html',
      tutorialUrl: 'https://www.quizmate.vip/',
      allowedExternalHosts: ['quizmate.vip', 'offer.quizmate.cn'],
      creditCostPerSuccess: 10,
      creditCostPerInterview: 30,
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

  // ===== AI 模型配置 =====
  getAIModelConfig(key: string): AIModelConfig | undefined {
    return this.appConfig.aiModels?.[key];
  }
  getAllAIModelConfigs(): Record<string, AIModelConfig> {
    return this.appConfig.aiModels || {};
  }

  // ===== App Config =====
  getAppConfig(): AppConfig {
    return this.appConfig;
  }

  // ===== Auth =====
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

  // ===== Client Settings =====
  getClientSettings(): ClientSettings {
    return this.store.get('clientSettings') || {};
  }
  updateClientSettings(patch: Partial<ClientSettings>) {
    this.store.set('clientSettings', { ...this.getClientSettings(), ...patch });
  }

  // ===== User Config（兼容原考试插件 API） =====
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

  // ===== Shortcut Bindings =====
  getShortcutBindings(): Record<string, string> {
    return this.store.get('shortcutBindings') || {};
  }
  setShortcutBindings(bindings: Record<string, string>) {
    this.store.set('shortcutBindings', bindings);
  }

  // ===== Processing Mode =====
  getProcessingMode(): 'overlay' | 'voice' {
    return this.getClientSettings().processingMode || 'overlay';
  }
  setProcessingMode(mode: 'overlay' | 'voice') {
    this.updateClientSettings({ processingMode: mode });
  }

  // ===== Background Opacity =====
  getBackgroundOpacity(): number {
    return this.store.get('backgroundOpacity') ?? this.appConfig.defaultBackgroundOpacity ?? 0.8;
  }
  setBackgroundOpacity(opacity: number) {
    this.store.set('backgroundOpacity', opacity);
  }

  // ===== Theme =====
  getTheme(): 'dark' | 'light' {
    return this.store.get('theme') as 'dark' | 'light' || 'dark';
  }
  setTheme(theme: 'dark' | 'light') {
    this.store.set('theme', theme);
  }

  // ===== Window Position / Size =====
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
