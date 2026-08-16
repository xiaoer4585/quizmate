import type { Database, Queryable } from "./db.js";
import type { AppConfig } from "./config.js";
import type { PaymentDependencies } from "./payments/config.js";
import type { RuntimeSettingsStore } from "./services/runtime-settings.js";
import type { NotificationSender } from "./services/smtp.js";
import type { WatchDependencies } from "./watch/actions.js";

export type ActionInput = Record<string, unknown> & { action?: string };

export type ActionResult = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type ActionHandler = (input: ActionInput, context: RequestContext) => Promise<ActionResult>;

export type ActionRegistry = ReadonlyMap<string, ActionHandler>;

export interface RequestContext {
  requestId: string;
  clientIp: string;
  db: Queryable;
}

export interface AppServices {
  db: Queryable;
  actions: ActionRegistry;
  version: string;
  watch?: WatchDependencies;
}

export interface ActionDependencies {
  db: Database;
  config: AppConfig;
  emailCodeSecret: string;
  registerBonusCredits: number;
  sessionTtlDays: number;
  sendVerificationCode: (email: string, code: string, purpose: "register" | "reset_password") => Promise<void>;
  sendNotification?: NotificationSender;
  runAnalysisModel: (request: AnalysisModelRequest) => Promise<AnalysisModelResult>;
  runTtsSynth?: (request: SpeakModelRequest) => Promise<SpeakModelResult>;
  payment?: PaymentDependencies;
  settings?: RuntimeSettingsStore;
  adminSecret?: string;
}

export interface AnalysisModelRequest {
  prompt: string;
  pageContext: unknown;
  screenshot: string;
  source: string;
  mode?: string; // 'voice' | 'overlay' | 'universal' — voice 模式使用独立模型配置和简洁提示词
}

export interface AnalysisItem {
  questionNo?: string;
  summary: string;
  answer: string;
  explanation: string;
}

export interface AnalysisModelResult {
  items: AnalysisItem[];
  note?: string;
}

export interface SpeakModelRequest {
  text: string;
  speaker?: string;
  format?: string;
  sampleRate?: number;
  speechRate?: number;
  loudnessRate?: number;
}

export interface SpeakModelResult {
  audioBase64: string;
  format: string;
  durationMs: number;
  charCount: number;
}
