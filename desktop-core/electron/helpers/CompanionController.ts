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
  private view: CompanionState = { workspace: 'pc', transitioning: false, connected: false, listening: false, capturing: false, pending: 0 };
  private processor: LightweightProcessingHelper;
  private capture: ScreenshotHelper;

  constructor(private config: ConfigHelper, private interview: InterviewHelper, private changed: (state: CompanionState) => void) {
    this.processor = new LightweightProcessingHelper(config);
    this.capture = new ScreenshotHelper(config);
    this.capture.init();
  }

  state(): CompanionState { return { ...this.view, serviceUrl: String(this.config.getClientSettings().companionServiceUrl || '') }; }
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
    await this.disconnect();
    const token = this.config.getAuthToken();
    if (!token) throw new Error('请先登录账号');
    this.ownerToken = token;
    const generation = this.generation;
    const pairing = await this.call<Pairing>('createRelayPairing');
    if (generation !== this.generation || token !== this.config.getAuthToken()) return;
    this.pairing = pairing;
    this.emit({ code: pairing.code, phoneUrl: pairing.phoneUrl, expiresAt: pairing.expiresAt, qr: await QRCode.toDataURL(pairing.phoneUrl), error: undefined });
    this.timer = setInterval(() => void this.sync(), 2000);
    await this.sync();
  }

  async activate() {
    if (!this.pairing || !this.view.connected) throw new Error('请先连接手机');
    this.enabled = true;
    this.emit({ workspace: 'mobile', error: undefined });
  }

  deactivate() {
    this.enabled = false;
    this.generation += 1;
    this.processor.cancelStreaming();
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
    if (!this.enabled) throw new Error('请先启用 PC+手机工作区');
    if (this.interview.isListening()) this.interview.stopForWorkspace();
    else {
      if (!this.view.connected) throw new Error('手机已离线，请恢复连接后开始面试');
      await this.interview.start();
    }
    this.emit({ listening: this.interview.isListening() });
  }

  async screenshot() {
    if (!this.enabled || this.view.capturing) return;
    if (!this.view.connected || this.queued.size >= 190) {
      this.emit({ error: '手机未连接或同步队列已满，请连接后再截图。' }); return;
    }
    const generation = this.generation;
    const valid = () => this.enabled && generation === this.generation && this.ownerToken === this.config.getAuthToken();
    const id = crypto.randomUUID();
    const card: CompanionCard = { id, kind: 'exam', question: '正在识别题目…', answer: '', explanation: '', status: 'pending', createdAt: Date.now() };
    this.emit({ capturing: true, error: undefined });
    this.put(card);
    try {
      const shot = await this.capture.captureFullScreen();
      if (!shot.success || !shot.filePath) throw new Error(shot.error || '截图失败');
      const compressed = await this.capture.getCombinedCompressedScreenshot([shot.filePath]);
      if (!valid()) return;
      if (!compressed.dataUrl) throw new Error('截图读取失败，请重新截图');
      const result = await this.processor.analyze({ images: [compressed.dataUrl], mode: 'overlay', requestId: `mobile-${id}`, operationId: id });
      if (!valid()) return;
      if (!result.success) throw new Error(result.error || '分析失败');
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
      for (const [id, card] of Array.from(this.queued).slice(0, 20)) {
        await this.call('publishRelayResult', { sessionId, card });
        if (sessionId !== this.pairing?.sessionId) return;
        if (this.queued.get(id) === card) this.queued.delete(id);
      }
      this.emit();
    } catch (error) {
      if (sessionId === this.pairing?.sessionId) this.emit({ connected: false, error: error instanceof Error ? error.message : '手机同步连接失败' });
    } finally { this.polling = false; }
  }
}
