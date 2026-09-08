// 面试助手 - 语音识别面试官问题，AI 生成参考答案
// 架构：主进程实时听写 -> isQuestion 过滤 -> 调后端 AI 生成答案 -> overlay 展示 + TTS
// 答案结合用户输入的岗位、公司信息以及上传的简历
import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { ConfigHelper, type SavedInterviewContext } from '../ConfigHelper';
import { AuthManager } from '../AuthManager';
import { OverlayManager } from '../OverlayManager';
import { TtsHelper } from './TtsHelper';
import { ByteDanceTtsHelper } from './ByteDanceTtsHelper';
import { RealtimeVoiceHelper } from './RealtimeVoiceHelper';
import { postAction, ApiError, type ApiRequestTiming } from '../apiClient';
import {
  ASR_FINAL_COMMIT_MS,
  ASR_FRAGMENT_SETTLE_MS,
  ASR_SILENCE_COMMIT_MS,
  composeTranscript,
  isLikelyInterviewQuestion,
  isLikelyIncompleteInterviewFragment,
  mergeFinalTranscript,
  mergeIncrementalTranscript,
  limitInterviewRequestContext,
  normalizeTranscript,
} from '../../shared/interviewTranscript';
import type { VoiceHealthSnapshot } from '../../shared/reliability';
import { createIdleVoiceSnapshot, isVoiceSessionActive } from '../../shared/reliability';
import { DiagnosticLogger } from './DiagnosticLogger';

const ACTION_INTERVIEW = 'generateInterviewAnswer';
const MAX_ANSWER_RETRIES = 2;
const RETRY_DELAYS_MS = [500, 1200];
const interviewDiagnostics = new DiagnosticLogger();

export interface InterviewContext {
  position?: string;
  company?: string;
  jobDescription?: string;
  jobDescriptionHtml?: string;
  resumeText?: string;
  resumeId?: string;
  language?: string;
  answerStyle?: 'concise' | 'detailed';
  audioMode?: 'demo' | 'formal';
}

export interface InterviewResume {
  id: string;
  name: string;
  text: string;
  uploadedAt: string;
  accountScope?: string;
}

export type InterviewTaskStatus = 'pending' | 'streaming' | 'done' | 'error';

export interface InterviewTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: InterviewTaskStatus | 'skipped';
  ts: number;
}

interface InterviewStoreSchema {
  resumes: InterviewResume[];
  activeResumeId?: string;
  tasks: InterviewTask[];
}

export class InterviewHelper {
  // 并发生成上限：新问题立即调用 AI 与上一题并行生成（后端按请求独立事务扣积分，并发安全），
  // 超过上限才短暂排队，避免连续快速提问触发模型限流。原先的串行队列会让第二题
  // 等待第一题完整生成（6~15 秒）才开始请求，是面试响应变慢的主要客户端原因。
  private static readonly MAX_CONCURRENT_ANSWERS = 2;
  private listening = false;
  private voiceState: VoiceHealthSnapshot = createIdleVoiceSnapshot();
  private context: InterviewContext = { language: 'zh', answerStyle: 'concise' };
  private lastAnswer = '';
  private answerRequests = new Map<string, AbortController>();
  private activeAnswerCount = 0;
  private answerWaiters: Array<() => void> = [];
  private answerGeneration = 0;
  private pendingTranscript = '';
  private finalizedTranscript = '';
  private interimTranscript = '';
  private conversationContext = '';
  private conversationTurns: Array<{ text: string; ts: number; accountScope: string }> = [];
  private conversationAccountScope = '';
  private transcriptCommitTimer: NodeJS.Timeout | null = null;
  private voiceQuestionDraft: { text: string; accountScope: string } | null = null;
  private voiceQuestionDraftTimer: NodeJS.Timeout | null = null;
  private store: Store<InterviewStoreSchema>;
  private contextAccountScope = '';

  constructor(
    private configHelper: ConfigHelper,
    private authManager: AuthManager,
    private overlay: OverlayManager,
    private tts: TtsHelper,
    private byteDanceTts?: ByteDanceTtsHelper,
    private realtimeVoice?: RealtimeVoiceHelper,
    private companion?: { onEvent: (channel: string, payload: unknown) => void }
  ) {
    this.store = new Store<InterviewStoreSchema>({
      name: companion ? 'mobile-interview-data' : 'interview-data',
      defaults: { resumes: [], tasks: [] },
    });
    this.contextAccountScope = this.configHelper.getInterviewAccountScope();
    this.conversationAccountScope = this.contextAccountScope;
    this.context = { ...this.context, ...this.configHelper.getInterviewContext() };
  }

  isListening() {
    return isVoiceSessionActive(this.voiceState);
  }

  // ===== 简历管理 =====
  listResumes(): InterviewResume[] {
    const scope = this.configHelper.getInterviewAccountScope();
    return this.store.get('resumes').filter((resume) => resume.accountScope === scope);
  }

  addResume(id: string, name: string, text: string): InterviewResume {
    const scope = this.configHelper.getInterviewAccountScope();
    const resumes = this.store.get('resumes');
    const existing = resumes.find((r) => r.id === id && r.accountScope === scope);
    const resume: InterviewResume = { id, name, text, uploadedAt: new Date().toISOString(), accountScope: this.configHelper.getInterviewAccountScope() };
    if (existing) {
      Object.assign(existing, resume);
    } else {
      resumes.push(resume);
    }
    this.store.set('resumes', resumes);
    return resume;
  }

  deleteResume(id: string) {
    const scope = this.configHelper.getInterviewAccountScope();
    this.store.set('resumes', this.store.get('resumes').filter((r) => !(r.id === id && r.accountScope === scope)));
    if (this.store.get('activeResumeId') === id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
    }
    this.persistContext();
  }

  setActiveResume(id: string | null) {
    if (!id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
      this.persistContext();
      return;
    }
    const resume = this.listResumes().find((r) => r.id === id);
    if (!resume) return;
    this.store.set('activeResumeId', id);
    this.context.resumeText = resume.text;
    this.context.resumeId = id;
    this.persistContext();
  }

  getActiveResume(): InterviewResume | undefined {
    const id = this.store.get('activeResumeId');
    if (!id) return undefined;
    return this.listResumes().find((r) => r.id === id);
  }

  // ===== 任务列表 =====
  getTasks(): InterviewTask[] {
    return this.store.get('tasks');
  }

  clearTasks() {
    this.store.set('tasks', []);
    this.overlay.renderTaskList([]);
    this.broadcast('interview:tasksCleared', {});
  }

  private addTask(question: string): InterviewTask {
    const task: InterviewTask = {
      id: `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      question,
      status: 'pending',
      ts: Date.now(),
    };
    const tasks = this.getTasks();
    tasks.unshift(task);
    this.store.set('tasks', tasks.slice(0, 50));
    this.overlay.renderTaskList(this.getTasks());
    this.broadcast('interview:taskAdded', task);
    return task;
  }

  private updateTask(id: string, patch: Partial<InterviewTask>) {
    const tasks = this.getTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    tasks[idx] = { ...tasks[idx], ...patch };
    this.store.set('tasks', tasks);
    this.overlay.renderTaskList(this.getTasks());
    this.broadcast('interview:taskUpdated', tasks[idx]);
  }

  // ===== 监听控制 =====
  async start(context?: InterviewContext) {
    if (isVoiceSessionActive(this.voiceState)) return;
    this.ensureContextAccountScope();
    if (context) this.setContext(context);
    else this.context = { ...this.context, ...this.configHelper.getInterviewContext() };
    // 自动加载激活简历
    if (!this.context.resumeText) {
      const active = this.getActiveResume();
      if (active) {
        this.context.resumeText = active.text;
        this.context.resumeId = active.id;
      }
    }
    const token = this.configHelper.getAuthToken();
    if (!token) {
      this.overlay.render({
        type: 'interview',
        title: '未登录',
        content: '请先登录后再使用面试助手',
      });
      return;
    }
    this.listening = true;
    this.clearPendingTranscript();
    // 启动火山引擎大模型流式语音识别。
    if (this.realtimeVoice) {
      try {
        await this.realtimeVoice.start(
          (text, isFinal) => this.handleRealtimeTranscript(text, isFinal),
          (error) => this.broadcast('interview:transcript', { error }),
          {
            audioMode: this.context.audioMode || 'demo',
            onState: (snapshot) => this.handleVoiceState(snapshot),
          }
        );
      } catch (e) {
        this.listening = false;
        const error = e instanceof Error ? e.message : '实时语音识别启动失败';
        this.broadcast('interview:transcript', { error });
        throw new Error(error);
      }
    }
    const resumeInfo = this.context.resumeText
      ? `已加载简历：${this.getActiveResume()?.name || '当前简历'}`
      : '未加载简历（答案将不结合个人经历）';
    this.overlay.render({
      type: 'interview',
      title: '面试助手已开启',
      content: `正在监听面试官提问…\n${resumeInfo}\n语音识别：火山引擎实时语音模型`,
    });
    this.broadcast('interview:transcript', { status: 'started', context: this.context, voiceState: this.voiceState });
  }

  stop() {
    this.stopInternal(true);
  }

  /** Explicit workspace shutdown discards unsent fragments instead of generating a final answer. */
  stopForWorkspace() {
    this.answerGeneration += 1;
    for (const controller of this.answerRequests.values()) controller.abort('workspace-ended');
    this.answerRequests.clear();
    this.stopInternal(false);
    if (this.companion) this.clearTasks();
    this.conversationTurns = [];
    this.conversationContext = '';
  }

  private stopInternal(flushPending: boolean) {
    const pendingTranscript = flushPending ? this.takePendingTranscript() : '';
    const pendingVoiceQuestion = flushPending ? this.takeVoiceQuestionDraft() : '';
    const pendingAccountScope = this.contextAccountScope;
    if (!flushPending) {
      this.clearPendingTranscript();
      this.takeVoiceQuestionDraft();
    }
    this.listening = false;
    if (flushPending) {
      this.answerGeneration += 1;
      for (const controller of this.answerRequests.values()) controller.abort('listening-stopped');
      this.answerRequests.clear();
    }
    this.tts.stop();
    this.byteDanceTts?.stop();
    // Mode switches restart the capture pipeline immediately. Do not send an
    // end-of-stream packet in that path, otherwise it can race with the new
    // WebSocket and terminate the fresh session.
    this.realtimeVoice?.stop(flushPending);
    this.voiceState = createIdleVoiceSnapshot();
    this.broadcast('interview:stateChanged', this.voiceState);
    this.broadcast('interview:transcript', { status: 'stopped' });
    if (pendingTranscript) void this.onTranscript(pendingTranscript, pendingAccountScope, 'voice');
    if (pendingVoiceQuestion) void this.submitInterviewQuestion(pendingVoiceQuestion, pendingAccountScope);
  }

  async restart(context?: InterviewContext) {
    const wasListening = this.listening;
    if (wasListening) this.stopInternal(false);
    if (context) this.setContext(context);
    if (wasListening) await this.start();
    else await this.start(context);
  }

  toggle() {
    if (this.listening) this.stop();
    else this.start();
  }

  toggleListening() {
    this.toggle();
  }

  getRealtimeVoiceConfig() {
    return this.realtimeVoice?.getPublicConfig() ?? { provider: 'unavailable' };
  }

  getVoiceState(): VoiceHealthSnapshot {
    return this.realtimeVoice?.getHealthSnapshot() ?? { ...this.voiceState };
  }

  async retryVoice(): Promise<VoiceHealthSnapshot> {
    if (!this.realtimeVoice) throw new Error('实时语音模块不可用');
    await this.realtimeVoice.retry();
    return this.getVoiceState();
  }

  copyVoiceDiagnostic(): boolean {
    return this.realtimeVoice?.copyDiagnosticSummary() ?? false;
  }

  openVoiceDiagnosticFolder(): Promise<boolean> {
    return this.realtimeVoice?.openDiagnosticFolder() ?? Promise.resolve(false);
  }

  private handleVoiceState(snapshot: VoiceHealthSnapshot): void {
    this.voiceState = { ...snapshot };
    this.listening = isVoiceSessionActive(snapshot);
    this.broadcast('interview:stateChanged', snapshot);
  }

  /** 重听上一个面试答案 */
  replayLastAnswer() {
    if (!this.lastAnswer) return;
    if (this.byteDanceTts) {
      this.byteDanceTts.cancel();
      this.byteDanceTts.speak(this.lastAnswer).catch(() => {});
    } else {
      this.tts.cancel();
      this.tts.speak(this.lastAnswer);
    }
  }

  setContext(context: InterviewContext) {
    this.ensureContextAccountScope();
    this.context = { ...this.context, ...context };
    this.persistContext();
  }

  getContext(): SavedInterviewContext {
    const { position, company, jobDescription, jobDescriptionHtml, answerStyle, audioMode, resumeId } = this.context;
    return { position, company, jobDescription, jobDescriptionHtml, answerStyle, audioMode, resumeId };
  }

  saveContext(context: InterviewContext): SavedInterviewContext {
    this.setContext(context);
    return this.getContext();
  }

  private persistContext() {
    this.configHelper.setInterviewContext(this.getContext());
  }

  private ensureContextAccountScope() {
    const scope = this.configHelper.getInterviewAccountScope();
    if (scope === this.contextAccountScope) return;
    this.contextAccountScope = scope;
    // Never let a conversation, pending answer, or queued waiter cross an
    // account boundary. The auth token is account-scoped, so old requests are
    // also cancelled before the new account can submit a question.
    this.conversationContext = '';
    this.conversationTurns = [];
    this.conversationAccountScope = scope;
    this.takeVoiceQuestionDraft();
    this.answerGeneration += 1;
    for (const controller of this.answerRequests.values()) controller.abort('account-changed');
    this.answerRequests.clear();
    this.context = {
      language: 'zh',
      answerStyle: 'concise',
      audioMode: 'demo',
      ...this.configHelper.getInterviewContext(),
    };
  }

  private handleRealtimeTranscript(text: string, isFinal: boolean) {
    const normalized = normalizeTranscript(text);
    if (!normalized) return;

    if (isFinal) {
      this.finalizedTranscript = mergeFinalTranscript(this.finalizedTranscript, normalized);
      this.interimTranscript = '';
    } else {
      this.interimTranscript = mergeIncrementalTranscript(this.interimTranscript, normalized);
    }

    const combined = composeTranscript(this.finalizedTranscript, this.interimTranscript);
    if (combined && combined !== this.pendingTranscript) {
      this.pendingTranscript = combined;
      this.broadcast('interview:transcript', { text: combined, isFinal: false });
    }

    this.scheduleTranscriptCommit(isFinal ? ASR_FINAL_COMMIT_MS : ASR_SILENCE_COMMIT_MS);
  }

  private scheduleTranscriptCommit(delayMs: number) {
    if (this.transcriptCommitTimer) clearTimeout(this.transcriptCommitTimer);
    this.transcriptCommitTimer = setTimeout(() => {
      this.transcriptCommitTimer = null;
      void this.commitPendingTranscript();
    }, delayMs);
  }

  private async commitPendingTranscript() {
    const transcript = this.takePendingTranscript();
    if (!transcript) return;
    this.broadcast('interview:transcript', { text: transcript, isFinal: true, committed: true });
    await this.onTranscript(transcript, this.contextAccountScope, 'voice');
  }

  private takePendingTranscript(): string {
    if (this.transcriptCommitTimer) {
      clearTimeout(this.transcriptCommitTimer);
      this.transcriptCommitTimer = null;
    }
    const transcript = this.pendingTranscript;
    this.pendingTranscript = '';
    this.finalizedTranscript = '';
    this.interimTranscript = '';
    return transcript;
  }

  private clearPendingTranscript() {
    this.takePendingTranscript();
  }

  private takeVoiceQuestionDraft(): string {
    if (this.voiceQuestionDraftTimer) {
      clearTimeout(this.voiceQuestionDraftTimer);
      this.voiceQuestionDraftTimer = null;
    }
    const draft = this.voiceQuestionDraft?.text || '';
    this.voiceQuestionDraft = null;
    return draft;
  }

  private scheduleVoiceQuestionDraft() {
    if (this.voiceQuestionDraftTimer) clearTimeout(this.voiceQuestionDraftTimer);
    this.voiceQuestionDraftTimer = setTimeout(() => {
      this.voiceQuestionDraftTimer = null;
      const draft = this.takeVoiceQuestionDraft();
      if (draft) void this.submitInterviewQuestion(draft, this.contextAccountScope);
    }, ASR_FRAGMENT_SETTLE_MS);
  }

  private mergeVoiceQuestionDraft(text: string, accountScope: string) {
    if (!this.voiceQuestionDraft || this.voiceQuestionDraft.accountScope !== accountScope) {
      this.voiceQuestionDraft = { text, accountScope };
    } else {
      this.voiceQuestionDraft.text = mergeFinalTranscript(this.voiceQuestionDraft.text, text);
    }
    this.scheduleVoiceQuestionDraft();
  }

  /** 接收识别文本，自动过滤非问题，是问题则生成答案 */
  async onTranscript(text: string, accountScope = this.contextAccountScope, source: 'voice' | 'manual' = 'manual') {
    this.ensureContextAccountScope();
    if (accountScope !== this.contextAccountScope) return;
    const raw = normalizeTranscript(text);
    if (!raw) return;

    // 非问题自动过滤：不在悬浮框左侧显示
    if (!isLikelyInterviewQuestion(raw, this.context.audioMode || 'demo')) {
      console.log('[Interview] Filtered non-question:', raw);
      this.broadcast('interview:transcript', { text: raw, skipped: true, display: false });
      return;
    }

    if (source === 'voice') {
      if (isLikelyIncompleteInterviewFragment(raw)) {
        this.mergeVoiceQuestionDraft(raw, accountScope);
        return;
      }
      if (this.voiceQuestionDraft?.accountScope === accountScope) {
        const draft = this.takeVoiceQuestionDraft();
        await this.submitInterviewQuestion(mergeFinalTranscript(draft, raw), accountScope);
        return;
      }
    }

    await this.submitInterviewQuestion(raw, accountScope);
  }

  private async submitInterviewQuestion(raw: string, accountScope: string) {
    this.ensureContextAccountScope();
    if (accountScope !== this.contextAccountScope) return;

    // Snapshot only prior turns. The current transcript is the question being
    // answered and should not be duplicated inside its own context field.
    const requestContext = this.createRequestContext();
    this.appendConversationContext(raw);
    this.broadcast('interview:transcript', { text: raw });
    const task = this.addTask(raw);
    // 并行生成：每个问题立即调用 AI，不再串行等待上一题生成完成；
    // 积分扣减由后端每请求独立事务保证，余额不足时该题按既有 402 逻辑提示。
    await this.enqueueAnswer(raw, task.id, requestContext);
  }

  private appendConversationContext(text: string) {
    if (this.conversationAccountScope !== this.contextAccountScope) {
      this.conversationContext = '';
      this.conversationAccountScope = this.contextAccountScope;
    }
    const normalized = normalizeTranscript(text);
    const now = Date.now();
    this.conversationTurns.push({ text: normalized, ts: now, accountScope: this.contextAccountScope });
    this.conversationTurns = this.conversationTurns.filter((turn) => turn.accountScope === this.contextAccountScope && now - turn.ts <= 60 * 60 * 1000);
    this.conversationContext = this.conversationTurns.map((turn, index) => `问题${index + 1}：${turn.text}`).join('\n');
    this.broadcast('interview:transcript', { text, contextOnly: true });
  }

  private getRecentConversationContext(): string {
    const now = Date.now();
    this.conversationTurns = this.conversationTurns.filter((turn) => turn.accountScope === this.contextAccountScope && now - turn.ts <= 60 * 60 * 1000);
    return this.conversationTurns.map((turn, index) => `问题${index + 1}：${turn.text}`).join('\n');
  }

  private createRequestContext() {
    const boundedContext = process.platform === 'darwin'
      ? limitInterviewRequestContext({
          jobDescription: this.context.jobDescription,
          resumeText: this.context.resumeText,
          recentConversation: this.getRecentConversationContext(),
        })
      : {
          jobDescription: this.context.jobDescription,
          resumeText: this.context.resumeText,
          recentConversation: this.getRecentConversationContext(),
        };
    return {
      position: this.context.position,
      company: this.context.company,
      jobDescription: boundedContext.jobDescription,
      resumeText: boundedContext.resumeText,
      language: this.context.language,
      answerStyle: this.context.answerStyle,
      recentConversation: boundedContext.recentConversation,
    };
  }

  private enqueueAnswer(question: string, taskId: string, requestContext: ReturnType<InterviewHelper['createRequestContext']>): Promise<void> {
    const queuedAt = Date.now();
    const generation = this.answerGeneration;
    const expired = () => {
      this.updateTask(taskId, { status: 'error', error: '听写已停止，未提交该问题' });
    };
    if (generation !== this.answerGeneration) {
      expired();
      return Promise.resolve();
    }
    return this.acquireAnswerSlot().then(() => {
      // 等到并发槽后再次校验，避免停止听写后仍发起请求
      if (generation !== this.answerGeneration) {
        expired();
        this.releaseAnswerSlot();
        return;
      }
      return this.generateAnswer(question, taskId, Date.now() - queuedAt, requestContext).finally(() => this.releaseAnswerSlot());
    });
  }

  /** 获取一个答案生成并发槽（立即或等待让出） */
  private acquireAnswerSlot(): Promise<void> {
    if (this.activeAnswerCount < InterviewHelper.MAX_CONCURRENT_ANSWERS) {
      this.activeAnswerCount += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.answerWaiters.push(resolve);
    });
  }

  /** 释放并发槽：优先直接交给等待者（计数不变），否则计数减一 */
  private releaseAnswerSlot(): void {
    const next = this.answerWaiters.shift();
    if (next) {
      next();
    } else {
      this.activeAnswerCount = Math.max(0, this.activeAnswerCount - 1);
    }
  }

  /** 调后端 AI 生成答案（结合简历+岗位+公司） */
  async generateAnswer(question: string, taskId?: string, slotWaitMs = 0, requestContext = this.createRequestContext()) {
    const cfg = this.configHelper.getAppConfig();
    const token = this.configHelper.getAuthToken();
    if (!token) return;

    if (!taskId) {
      const task = this.addTask(question);
      taskId = task.id;
    }

    const requestController = new AbortController();
    this.answerRequests.set(taskId, requestController);

    this.updateTask(taskId, { status: 'streaming' });

    const prepareStartedAt = Date.now();
    const contextChars = Object.values(requestContext).reduce(
      (total, value) => total + (typeof value === 'string' ? value.length : 0),
      0,
    );
    const requestPrepareMs = Date.now() - prepareStartedAt;
    const requestStartedAt = Date.now();
    let apiTiming: ApiRequestTiming | undefined;

    try {
      let data: { answer: string; keyPoints?: string[]; creditBalance?: number } | undefined;
      for (let attempt = 0; attempt <= MAX_ANSWER_RETRIES; attempt += 1) {
        try {
          data = await postAction<{ answer: string; keyPoints?: string[]; creditBalance?: number }>(
            cfg.apiBaseUrl,
            ACTION_INTERVIEW,
            { question, context: requestContext, deviceId: this.authManager.getDeviceId() },
            {
              timeoutMs: cfg.httpTimeoutMs,
              signal: requestController.signal,
              token,
              onTiming: (timing) => { apiTiming = timing; },
            }
          );
          break;
        } catch (error) {
          const retryable = error instanceof ApiError
            && !requestController.signal.aborted
            && (error.kind === 'network' || error.kind === 'timeout' || error.statusCode >= 500);
          // Legacy interview API has no request idempotency. Never retry a mobile
          // request with an unknown outcome automatically (it could charge twice).
          if (this.companion || !retryable || attempt >= MAX_ANSWER_RETRIES) throw error;
          interviewDiagnostics.append('interview-audio', 'answer.request.retry', {
            attempt: attempt + 1,
            delayMs: RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1],
            code: error.code,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] || 1200));
        }
      }
      if (!data) throw new Error('答案生成失败');
      if (requestController.signal.aborted) return;
      const answer = data.answer || '暂无答案';
      this.lastAnswer = answer;
      this.updateTask(taskId, { status: 'done', answer, keyPoints: data.keyPoints });
      this.broadcast('interview:answer', { question, answer, keyPoints: data.keyPoints, taskId });
      if (typeof data.creditBalance === 'number') this.broadcast('credits-updated', data.creditBalance);
      interviewDiagnostics.append('interview-audio', 'answer.request.success', {
        questionChars: question.length,
        contextChars,
        requestPrepareMs,
        slotWaitMs,
        api: apiTiming,
        totalMs: Date.now() - requestStartedAt,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '答案生成失败';
      this.updateTask(taskId, { status: 'error', error: msg });
      this.broadcast('interview:answer', { question, error: msg, taskId });
      interviewDiagnostics.append('interview-audio', 'answer.request.error', {
        code: e instanceof ApiError ? e.code : 'UNKNOWN',
        kind: e instanceof ApiError ? e.kind : 'unknown',
        questionChars: question.length,
        contextChars,
        requestPrepareMs,
        slotWaitMs,
        api: apiTiming,
        totalMs: Date.now() - requestStartedAt,
      });
    } finally {
      this.answerRequests.delete(taskId);
    }
  }

  private broadcast(channel: string, payload: unknown) {
    if (this.companion) {
      this.companion.onEvent(channel, payload);
      return;
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}
