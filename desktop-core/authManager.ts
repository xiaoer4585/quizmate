import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { DesktopClientPlatform, DesktopDevicePrefix } from './platform';
import type { DesktopConfigHelper, UserInfo } from './configHelper';
import { ApiError, createDesktopApiClient } from './apiClient';

export interface LoginResult {
  success: boolean;
  error?: string;
  code?: string;
  token?: string;
  account?: UserInfo;
  expiresAt?: string;
}
export interface RegisterResult {
  success: boolean;
  error?: string;
  code?: string;
  inviteCode?: string;
}
export interface SendRegisterCodeResult {
  success: boolean;
  error?: string;
  code?: string;
  cooldown?: number;
  reused?: boolean;
  message?: string;
}
export interface ProfileResult {
  success: boolean;
  error?: string;
  code?: string;
  account?: UserInfo;
  costPerSuccess?: number;
  creditBalance?: number;
}

export class DesktopAuthManager {
  private apiEndpoint = '';
  private deviceId = '';
  private api: ReturnType<typeof createDesktopApiClient>;

  constructor(
    private configHelper: DesktopConfigHelper,
    private platform: { clientPlatform: DesktopClientPlatform; deviceIdPrefix: DesktopDevicePrefix }
  ) {
    this.api = createDesktopApiClient(platform.clientPlatform);
  }

  init() {
    this.apiEndpoint = this.configHelper.getAppConfig().apiBaseUrl;
    this.deviceId = this.loadOrCreateDeviceId();
    this.configHelper.updateClientSettings({ deviceId: this.deviceId });
  }
  getDeviceId() {
    return this.deviceId;
  }
  private loadOrCreateDeviceId(): string {
    try {
      const idFile = path.join(app.getPath('userData'), 'device-id.json');
      if (fs.existsSync(idFile)) {
        const parsed = JSON.parse(fs.readFileSync(idFile, 'utf8'));
        if (parsed.deviceId) return parsed.deviceId;
      }
      const newId = `${this.platform.deviceIdPrefix}-${crypto.randomUUID()}`;
      fs.mkdirSync(path.dirname(idFile), { recursive: true });
      fs.writeFileSync(idFile, JSON.stringify({ deviceId: newId, createdAt: new Date().toISOString() }, null, 2), 'utf8');
      return newId;
    } catch {
      return `${this.platform.deviceIdPrefix}-${crypto.randomUUID()}`;
    }
  }
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      const data = await this.api.postAction<{ account: UserInfo; token: string; expiresAt?: string }>(
        this.apiEndpoint,
        'loginAccount',
        { email, password, deviceId: this.deviceId, platform: this.platform.clientPlatform, appVersion: this.configHelper.getAppConfig().version },
        { timeoutMs: 30000 }
      );
      if (!data.account || !data.token) return { success: false, error: '登录响应格式不正确。', code: 'BAD_RESPONSE' };
      this.configHelper.setAuthToken(data.token);
      this.configHelper.setUserInfo(data.account);
      this.writeSharedSession(data.token);
      return { success: true, token: data.token, account: data.account, expiresAt: data.expiresAt };
    } catch (e) {
      if (e instanceof ApiError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: `网络错误: ${(e as Error).message}`, code: 'NETWORK_ERROR' };
    }
  }
  async sendRegisterCode(email: string): Promise<SendRegisterCodeResult> {
    try {
      const data = await this.api.postAction<{ cooldown?: number; reused?: boolean; message?: string }>(this.apiEndpoint, 'sendRegisterCode', { email }, { timeoutMs: 30000 });
      return { success: true, ...data };
    } catch (e) {
      if (e instanceof ApiError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: `网络错误: ${(e as Error).message}`, code: 'NETWORK_ERROR' };
    }
  }
  async register(email: string, code: string, password: string, inviteCode?: string): Promise<RegisterResult> {
    try {
      const data = await this.api.postAction<{ inviteCode?: string; account?: UserInfo; token?: string }>(
        this.apiEndpoint,
        'registerAccount',
        { email, code, password, deviceId: this.deviceId, platform: this.platform.clientPlatform, appVersion: this.configHelper.getAppConfig().version, inviteCode: inviteCode || '' },
        { timeoutMs: 30000 }
      );
      if (data.account && data.token) {
        this.configHelper.setAuthToken(data.token);
        this.configHelper.setUserInfo(data.account);
        this.writeSharedSession(data.token);
      }
      return { success: true, inviteCode: data.inviteCode };
    } catch (e) {
      if (e instanceof ApiError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: `网络错误: ${(e as Error).message}`, code: 'NETWORK_ERROR' };
    }
  }
  async isAuthenticated(): Promise<boolean> {
    if (this.configHelper.getAuthToken()) return true;
    const shared = this.readSharedSession();
    if (shared) {
      this.configHelper.setAuthToken(shared);
      return true;
    }
    return false;
  }
  async validateSession(): Promise<boolean> {
    const token = this.configHelper.getAuthToken();
    if (!token) return false;
    try {
      const data = await this.api.postAction<{ account: UserInfo }>(this.apiEndpoint, 'getAccountProfile', { accountToken: token }, { timeoutMs: 15000 });
      if (data.account) this.configHelper.setUserInfo(data.account);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'auth') this.configHelper.clearAuth();
      return false;
    }
  }
  async fetchUserInfo(): Promise<UserInfo | null> {
    const token = this.configHelper.getAuthToken();
    if (!token) return null;
    try {
      const data = await this.api.postAction<{ account: UserInfo }>(this.apiEndpoint, 'getAccountProfile', { accountToken: token }, { timeoutMs: 15000 });
      if (data.account) {
        this.configHelper.setUserInfo(data.account);
        return data.account;
      }
      return null;
    } catch {
      return null;
    }
  }
  async getProfile(): Promise<ProfileResult> {
    const token = this.configHelper.getAuthToken();
    if (!token) return { success: false, error: '未登录', code: 'AUTH_REQUIRED' };
    try {
      const { data, envelope } = await this.api.postActionEnvelope<{ account: UserInfo; costPerSuccess?: number }>(this.apiEndpoint, 'getAccountProfile', { accountToken: token }, { timeoutMs: 15000 });
      if (data.account) this.configHelper.setUserInfo(data.account);
      return { success: true, account: data.account, costPerSuccess: data.costPerSuccess, creditBalance: envelope.creditBalance };
    } catch (e) {
      if (e instanceof ApiError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: `网络错误: ${(e as Error).message}`, code: 'NETWORK_ERROR' };
    }
  }
  async logout(): Promise<void> {
    const token = this.configHelper.getAuthToken();
    if (token) {
      try {
        await this.api.postAction(this.apiEndpoint, 'logoutAccount', { accountToken: token }, { timeoutMs: 10000 });
      } catch {}
    }
    this.configHelper.clearAuth();
  }
  private writeSharedSession(token: string) {
    try {
      const candidates = [path.join(app.getAppPath(), 'shared-session.json'), path.join(app.getAppPath(), '..', 'shared-session.json')];
      for (const p of candidates) {
        try {
          fs.writeFileSync(p, JSON.stringify({ sessionId: token, token, ts: Date.now() }), 'utf8');
        } catch {}
      }
    } catch {}
  }
  private readSharedSession(): string | null {
    try {
      const candidates = [
        path.join(app.getAppPath(), 'shared-session.json'),
        path.join(app.getAppPath(), '..', 'shared-session.json'),
        path.join(process.resourcesPath, 'shared-session.json'),
        path.join(process.resourcesPath, '..', 'shared-session.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          const sid = parsed.token || parsed.sessionId || parsed.session_id;
          if (sid) return sid;
        }
      }
    } catch {}
    return null;
  }
}
