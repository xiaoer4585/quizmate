// 面试助手 - 语音识别面试官问题，AI 生成参考答案
// 架构：主进程实时听写 -> isQuestion 过滤 -> 调后端 AI 生成答案 -> overlay 展示 + TTS
// 答案结合用户输入的岗位、公司信息以及上传的简历
import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { ConfigHelper } from '../ConfigHelper';
import { AuthManager } from '../AuthManager';
import { OverlayManager } from '../OverlayManager';
import { TtsHelper } from './TtsHelper';
import { ByteDanceTtsHelper } from './ByteDanceTtsHelper';
import { RealtimeVoiceHelper } from './RealtimeVoiceHelper';
import { postAction, ApiError } from '../apiClient';
import {
  ASR_FINAL_COMMIT_MS,
  ASR_SILENCE_COMMIT_MS,
  isLikelyInterviewQuestion,
  mergeIncrementalTranscript,
  normalizeTranscript,
} from '../../shared/interviewTranscript';

const ACTION_INTERVIEW = 'generateInterviewAnswer';

export interface InterviewContext {
  position?: string;
  company?: string;
  jobDescription?: string;
  resumeText?: string;
  resumeId?: string;
  language?: string;
  answerStyle?: 'concise' | 'detailed';
}

export interface InterviewResume {
  id: string;
  name: string;
  text: string;
  uploadedAt: string;
}

export type InterviewTaskStatus = 'pending' | 'streaming' | 'done' | 'error';

export interface InterviewTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: InterviewTaskStatus;
  ts: number;
}

interface InterviewStoreSchema {
  resumes: InterviewResume[];
  activeResumeId?: string;
  tasks: InterviewTask[];
}

export class InterviewHelper {
  private listening = false;
  private context: InterviewContext = { language: 'zh', answerStyle: 'concise' };
  private lastQuestion = '';
  private lastQuestionAt = 0;
  private lastAnswer = '';
  private abortController: AbortController | null = null;
  private pendingTranscript = '';
  private transcriptCommitTimer: NodeJS.Timeout | null = null;
  private store: Store<InterviewStoreSchema>;

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
  }

  isListening() {
    return this.listening;
  }

  // ===== 简历管理 =====
  listResumes(): InterviewResume[] {
    return this.store.get('resumes');
  }

  addResume(id: string, name: string, text: string): InterviewResume {
    const resumes = this.listResumes();
    const existing = resumes.find((r) => r.id === id);
    const resume: InterviewResume = { id, name, text, uploadedAt: new Date().toISOString() };
    if (existing) {
      Object.assign(existing, resume);
    } else {
      resumes.push(resume);
    }
    this.store.set('resumes', resumes);
    return resume;
  }

  deleteResume(id: string) {
    this.store.set('resumes', this.listResumes().filter((r) => r.id !== id));
    if (this.store.get('activeResumeId') === id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
    }
  }

  setActiveResume(id: string | null) {
    if (!id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
      return;
    }
    const resume = this.listResumes().find((r) => r.id === id);
    if (!resume) return;
    this.store.set('activeResumeId', id);
    this.context.resumeText = resume.text;
    this.context.resumeId = id;
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
    if (context) this.context = { ...this.context, ...context };
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
          (error) => this.broadcast('interview:transcript', { error })
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
    const pendingTranscript = this.takePendingTranscript();
    this.listening = false;
    this.abortController?.abort();
    this.abortController = null;
    this.tts.stop();
    this.byteDanceTts?.stop();
    this.realtimeVoice?.stop();
    this.broadcast('interview:transcript', { status: 'stopped' });
    if (pendingTranscript) void this.onTranscript(pendingTranscript);
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
    this.context = { ...this.context, ...context };
  }

  private handleRealtimeTranscript(text: string, isFinal: boolean) {
    const merged = mergeIncrementalTranscript(this.pendingTranscript, text);
    const changed = merged !== this.pendingTranscript;
    if (!merged) return;

    if (changed) {
      this.pendingTranscript = merged;
      this.broadcast('interview:transcript', { text: merged, isFinal: false });
    } else if (!isFinal) {
      return;
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
    return transcript;
  }

  private clearPendingTranscript() {
    this.takePendingTranscript();
  }

  /** 接收识别文本，自动过滤非问题，是问题则生成答案 */
  async onTranscript(text: string) {
    const raw = normalizeTranscript(text);
    if (!raw) return;
    const now = Date.now();
    if (raw === this.lastQuestion && now - this.lastQuestionAt < 8000) return;

    // 非问题自动过滤：不在悬浮框左侧显示
    if (!isLikelyInterviewQuestion(raw)) {
      console.log('[Interview] Filtered non-question:', raw);
      const skipped = this.addTask(raw);
      this.updateTask(skipped.id, { status: 'skipped' });
      this.broadcast('interview:transcript', { text: raw, skipped: true });
      return;
    }

    this.lastQuestion = raw;
    this.lastQuestionAt = now;
    this.broadcast('interview:transcript', { text: raw });
    const task = this.addTask(raw);
    await this.generateAnswer(raw, task.id);
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

    this.abortController?.abort();
    this.abortController = new AbortController();

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
          },
          deviceId: this.authManager.getDeviceId(),
        },
        { timeoutMs: cfg.httpTimeoutMs, signal: this.abortController.signal, token }
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
    }
  }

  private broadcast(channel: string, payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}
