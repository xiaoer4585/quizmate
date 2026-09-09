import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { ConfigHelper } from '../ConfigHelper';
import { postAction } from '../apiClient';
import { ScreenshotHelper } from './ScreenshotHelper';
import { LightweightProcessingHelper } from './ProcessingHelper';
import { InterviewHelper } from './InterviewHelper';
import type { CompanionCard, CompanionState } from '../../shared/mobile-companion';

type Pairing = { sessionId: string; code: string; phoneUrl: string; expiresAt: number };

/** Transport only. AI and credit settlement remain in the existing API actions. */
export class CompanionController {
  private pairing?: Pairing;
  private ownerToken = '';
  private generation = 0;
  private queued = new Map<string, CompanionCard>();
  private timer?: NodeJS.Timeout;
  private polling = false;
  private enabled = false;
  private interviewStarting = false;
  private pendingShots: string[] = [];
  private latestAnswer = '';
  private view: CompanionState = { workspace: 'pc', transitioning: false, connected: false, listening: false, capturing: false, pending: 0 };
  private processor: LightweightProcessingHelper;
  private capture: ScreenshotHelper;

  constructor(private config: ConfigHelper, private interview: InterviewHelper, private changed: (state: CompanionState) => void) {
    this.processor = new LightweightProcessingHelper(config);
    this.capture = new ScreenshotHelper(config);
    this.capture.init();
  }

  state(): CompanionState {
    // 配对码同时从 pairing 和当前视图读取，避免某次心跳状态事件覆盖了二维码区域后连接码消失。
    const code = this.view.code || this.pairing?.code;
    const phoneUrl = this.view.phoneUrl || this.pairing?.phoneUrl;
    return { ...this.view, code, phoneUrl, expiresAt: this.view.expiresAt || this.pairing?.expiresAt,
      audioMode: this.interview.getContext().audioMode || 'demo', serviceUrl: String(this.config.getClientSettings().companionServiceUrl || 'https://api.quizmate.vip/companion-test/') };
  }
  async setAudioMode(value: unknown) {
    if (value !== 'demo' && value !== 'formal') throw new Error('音频模式无效');
    if (this.interviewStarting) throw new Error('面试正在启动，请稍候');
    const running = this.interview.isListening();
    this.interview.setContext({ audioMode: value });
    if (running) {
      this.interviewStarting = true;
      try { await this.interview.restart(); } finally { this.interviewStarting = false; }
    }
    this.emit({ listening: this.interview.isListening() });
  }
  private endpoint() {
    const value = this.state().serviceUrl;
    if (!value) throw new Error('请先填写独立手机测试服务地址');
    return `${value}api`;
  }
  setServiceUrl(value: unknown) {
    if (this.pairing || this.enabled) throw new Error('请先断开手机，再修改测试服务地址');
    if (typeof value !== 'string') throw new Error('测试服务地址无效');
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('请使用不含密码、参数的 HTTPS 测试服务地址');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    this.config.updateClientSettings({ companionServiceUrl: url.href });
    this.emit({ error: undefined });
  }
  private emit(patch: Partial<CompanionState> = {}) {
    this.view = { ...this.view, ...patch, pending: this.queued.size };
    this.changed(this.state());
  }

  private async call<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
    return postAction<T>(this.endpoint(), action, input, { token: this.ownerToken, timeoutMs: 15000 });
  }

  async pair() {
    const keepMobileWorkspace = this.enabled;
    await this.disconnect();
    const token = this.config.getAuthToken();
    if (!token) throw new Error('请先登录账号');
    this.ownerToken = token;
    const generation = this.generation;
    const pairing = await this.call<Pairing>('createRelayPairing');
    if (generation !== this.generation || token !== this.config.getAuthToken()) return;
    const phoneUrl = typeof pairing?.phoneUrl === 'string' ? pairing.phoneUrl.trim() : '';
    if (!phoneUrl) throw new Error('连接服务未返回手机地址，请稍后重试');
    let qr = '';
    try {
      // 由客户端本地生成二维码，避免依赖第三方二维码图片服务。
      qr = await QRCode.toDataURL(phoneUrl, { errorCorrectionLevel: 'M', margin: 2, width: 256 });
    } catch {
      throw new Error('二维码生成失败，请点击重新配对');
    }
    if (!qr.startsWith('data:image/')) throw new Error('二维码数据无效，请点击重新配对');
    this.pairing = pairing;
    this.emit({ code: pairing.code, phoneUrl, expiresAt: pairing.expiresAt, qr, error: undefined });
    if (keepMobileWorkspace) {
      this.enabled = true;
      this.emit({ workspace: 'mobile' });
    }
    this.timer = setInterval(() => void this.sync(), 2000);
    await this.sync();
  }

  async activate() {
    this.enabled = true;
    this.emit({ workspace: 'mobile', error: undefined });
  }

  deactivate() {
    this.enabled = false;
    this.generation += 1;
    this.processor.cancelStreaming();
    this.pendingShots = [];
    this.interview.stopForWorkspace();
    this.emit({ workspace: 'pc', capturing: false, listening: false });
  }

  async disconnect(keepWorkspace = false) {
    const sessionId = this.pairing?.sessionId;
    const token = this.ownerToken;
    this.deactivate();
    if (keepWorkspace) this.emit({ workspace: 'mobile' });
    clearInterval(this.timer);
    this.timer = undefined;
    this.pairing = undefined;
    this.ownerToken = '';
    this.pendingShots = [];
    this.latestAnswer = '';
    this.queued.clear();
    this.emit({ connected: false, code: undefined, qr: undefined, phoneUrl: undefined, expiresAt: undefined });
    if (sessionId && token) {
      try { await postAction(this.endpoint(), 'revokeRelaySession', { sessionId }, { token, timeoutMs: 5000 }); }
      catch { this.emit({ error: '本地已断开，远程会话将在心跳过期后停止接收。' }); }
    }
  }

  private put(card: CompanionCard) {
    if (!this.enabled || !this.pairing || this.ownerToken !== this.config.getAuthToken()) return;
    if (this.queued.size >= 200 && !this.queued.has(card.id)) {
      this.emit({ error: '手机同步队列已满，请恢复连接后继续。' });
      return;
    }
    if (card.status === 'done' && card.answer) this.latestAnswer = card.answer;
    this.queued.set(card.id, card);
    this.emit();
    void this.sync();
  }

  onInterviewEvent(channel: string, payload: unknown) {
    if (!this.enabled) return;
    if (channel === 'interview:stateChanged') this.emit({ listening: this.interview.isListening() });
    if (channel !== 'interview:taskAdded' && channel !== 'interview:taskUpdated') return;
    if (!payload || typeof payload !== 'object' || !('id' in payload)) return;
    const task = this.interview.getTasks().find(item => item.id === payload.id);
    if (!task) return;
    this.put({ id: task.id, kind: 'interview', question: task.question, answer: task.answer || '', explanation: '',
      status: task.status === 'done' ? 'done' : task.status === 'error' ? 'error' : 'pending', createdAt: task.ts, error: task.error });
  }

  async toggleInterview() {
    if (!this.enabled) throw new Error('请先开始双机协作');
    if (this.interviewStarting) { this.interview.stopForWorkspace(); this.emit({ listening: false }); return; }
    if (this.interview.isListening()) this.interview.stopForWorkspace();
    else {
      if (!this.view.connected) throw new Error('手机已离线，请恢复连接后开始面试');
      this.interviewStarting = true;
      try { await this.interview.start(); } finally { this.interviewStarting = false; }
    }
    this.emit({ listening: this.interview.isListening() });
  }

  async screenshot() {
    if (!this.enabled || this.view.capturing) return;
    if (!this.view.connected || this.pendingShots.length >= 3) {
      this.emit({ error: '手机未连接或同步队列已满，请连接后再截图。' }); return;
    }
    const generation = this.generation;
    const valid = () => this.enabled && generation === this.generation && this.ownerToken === this.config.getAuthToken();
    this.emit({ capturing: true, error: undefined });
    try {
      const shot = await this.capture.captureFullScreen();
      if (!shot.success || !shot.filePath) throw new Error(shot.error || '截图失败');
      const compressed = await this.capture.getCombinedCompressedScreenshot([shot.filePath]);
      if (!valid()) return;
      if (!compressed.dataUrl) throw new Error('截图读取失败，请重新截图');
      this.pendingShots.push(compressed.dataUrl);
      this.emit({ error: undefined });
    } catch (error) {
      if (valid()) {
        const message = error instanceof Error ? error.message : '处理失败';
        this.emit({ error: message });
      }
    } finally { if (valid()) this.emit({ capturing: false }); }
  }

  /** Analyze the screenshots collected by Alt+Q. */
  async searchLatestScreenshots() {
    if (!this.enabled || !this.view.connected) throw new Error('手机未连接，请先连接手机');
    if (!this.pendingShots.length) throw new Error('请先按截图快捷键');
    if (this.view.capturing) return;
    const generation = this.generation;
    const valid = () => this.enabled && generation === this.generation && this.ownerToken === this.config.getAuthToken();
    const images = this.pendingShots.slice(-3);
    const id = crypto.randomUUID();
    const card: CompanionCard = { id, kind: 'exam', question: '正在识别题目…', answer: '', explanation: '', status: 'pending', createdAt: Date.now() };
    this.put(card);
    this.emit({ capturing: true, error: undefined });
    try {
      const result = await this.processor.analyze({ images, mode: 'overlay', requestId: `mobile-${id}`, operationId: id });
      if (!valid()) return;
      if (!result.success) throw new Error(result.error || '分析失败');
      this.pendingShots = [];
      const items = Array.isArray(result.raw?.items) ? result.raw.items : [];
      if (items.length) {
        items.forEach((item: unknown, index: number) => {
          if (!item || typeof item !== 'object') return;
          const row = item as Record<string, unknown>;
          this.put({ ...card, id: index ? `${id}:${index}` : id, status: 'done',
            question: String(row.summary || `题目 ${index + 1}`), answer: String(row.answer || ''), explanation: String(row.explanation || '') });
        });
      } else this.put({ ...card, status: 'done', question: '题目识别完成', answer: result.answer || '', explanation: result.explanation || '' });
    } catch (error) {
      if (valid()) {
        const message = error instanceof Error ? error.message : '处理失败';
        this.put({ ...card, status: 'error', error: message });
        this.emit({ error: message });
      }
    } finally { if (valid()) this.emit({ capturing: false }); }
  }

  copyLatestAnswer() {
    if (!this.latestAnswer) throw new Error('手机还没有可复制的答案');
    return this.latestAnswer;
  }

  async sync() {
    if (!this.pairing || this.polling) return;
    if (this.ownerToken !== this.config.getAuthToken()) { await this.disconnect(this.view.workspace === 'mobile'); return; }
    this.polling = true;
    const sessionId = this.pairing.sessionId;
    const generation = this.generation;
    try {
      const data = await this.call<{ connected: boolean }>('relayHeartbeat', { sessionId });
      if (sessionId !== this.pairing?.sessionId || generation !== this.generation) return;
      this.emit({ connected: data.connected });
      if (!data.connected && this.enabled && this.interview.isListening()) {
        this.interview.stopForWorkspace();
        this.emit({ listening: false, error: '手机已离线，面试已停止。重新连接后可再次开始。' });
      }
      for (const [id, card] of Array.from(this.queued).slice(0, 20)) {
        await this.call('publishRelayResult', { sessionId, card });
        if (sessionId !== this.pairing?.sessionId) return;
        if (this.queued.get(id) === card) this.queued.delete(id);
      }
      this.emit();
    } catch (error) {
      if (sessionId === this.pairing?.sessionId && this.enabled && this.interview.isListening()) this.interview.stopForWorkspace();
      if (sessionId === this.pairing?.sessionId) this.emit({ connected: false, error: error instanceof Error ? error.message : '手机同步连接失败' });
    } finally { this.polling = false; }
  }
}
