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
import { postAction, ApiError } from '../apiClient';
import {
  ASR_FINAL_COMMIT_MS,
  ASR_SILENCE_COMMIT_MS,
  composeTranscript,
  isLikelyInterviewQuestion,
  mergeFinalTranscript,
  mergeIncrementalTranscript,
  normalizeTranscript,
} from '../../shared/interviewTranscript';

const ACTION_INTERVIEW = 'generateInterviewAnswer';

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
  private transcriptCommitTimer: NodeJS.Timeout | null = null;
  private store: Store<InterviewStoreSchema>;
  private contextAccountScope = '';

  constructor(
    private configHelper: ConfigHelper,
    private authManager: AuthManager,
    private overlay: OverlayManager,
    private tts: TtsHelper,
    private byteDanceTts?: ByteDanceTtsHelper,
    private realtimeVoice?: RealtimeVoiceHelper
  ) {
    this.store = new Store<InterviewStoreSchema>({
      name: 'interview-data',
      defaults: { resumes: [], tasks: [] },
    });
    this.contextAccountScope = this.configHelper.getInterviewAccountScope();
    this.context = { ...this.context, ...this.configHelper.getInterviewContext() };
  }

  isListening() {
    return this.listening;
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
    if (this.listening) return;
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
    this.conversationContext = '';
    // 启动火山引擎大模型流式语音识别。
    if (this.realtimeVoice) {
      try {
        await this.realtimeVoice.start(
          (text, isFinal) => this.handleRealtimeTranscript(text, isFinal),
          (error) => this.broadcast('interview:transcript', { error }),
          { audioMode: this.context.audioMode || 'demo' }
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
    this.broadcast('interview:transcript', { status: 'started', context: this.context });
  }

  stop() {
    this.stopInternal(true);
  }

  private stopInternal(flushPending: boolean) {
    const pendingTranscript = flushPending ? this.takePendingTranscript() : '';
    if (!flushPending) this.clearPendingTranscript();
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
    this.broadcast('interview:transcript', { status: 'stopped' });
    if (pendingTranscript) void this.onTranscript(pendingTranscript);
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
    await this.onTranscript(transcript);
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

  /** 接收识别文本，自动过滤非问题，是问题则生成答案 */
  async onTranscript(text: string) {
    const raw = normalizeTranscript(text);
    if (!raw) return;

    // 非问题自动过滤：不在悬浮框左侧显示
    if (!isLikelyInterviewQuestion(raw, this.context.audioMode || 'demo')) {
      console.log('[Interview] Filtered non-question:', raw);
      const skipped = this.addTask(raw);
      this.updateTask(skipped.id, { status: 'skipped' });
      this.broadcast('interview:transcript', { text: raw, skipped: true });
      return;
    }

    this.appendConversationContext(raw);
    this.broadcast('interview:transcript', { text: raw });
    const task = this.addTask(raw);
    // 并行生成：每个问题立即调用 AI，不再串行等待上一题生成完成；
    // 积分扣减由后端每请求独立事务保证，余额不足时该题按既有 402 逻辑提示。
    await this.enqueueAnswer(raw, task.id);
  }

  private appendConversationContext(text: string) {
    this.conversationContext = `${this.conversationContext} ${normalizeTranscript(text)}`.trim().slice(-4000);
    this.broadcast('interview:transcript', { text, contextOnly: true });
  }

  private enqueueAnswer(question: string, taskId: string): Promise<void> {
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
      return this.generateAnswer(question, taskId).finally(() => this.releaseAnswerSlot());
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
  async generateAnswer(question: string, taskId?: string) {
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

    try {
      const data = await postAction<{ answer: string; keyPoints?: string[]; creditBalance?: number }>(
        cfg.apiBaseUrl,
        ACTION_INTERVIEW,
        {
          question,
          context: {
            position: this.context.position,
            company: this.context.company,
            jobDescription: this.context.jobDescription,
            resumeText: this.context.resumeText,
            language: this.context.language,
            answerStyle: this.context.answerStyle,
            recentConversation: this.conversationContext,
          },
          deviceId: this.authManager.getDeviceId(),
        },
        { timeoutMs: cfg.httpTimeoutMs, signal: requestController.signal, token }
      );
      const answer = data.answer || '暂无答案';
      this.lastAnswer = answer;
      this.updateTask(taskId, { status: 'done', answer, keyPoints: data.keyPoints });
      this.broadcast('interview:answer', { question, answer, keyPoints: data.keyPoints, taskId });
      if (typeof data.creditBalance === 'number') this.broadcast('credits-updated', data.creditBalance);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '答案生成失败';
      this.updateTask(taskId, { status: 'error', error: msg });
      this.broadcast('interview:answer', { question, error: msg, taskId });
    } finally {
      this.answerRequests.delete(taskId);
    }
  }

  private broadcast(channel: string, payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}
