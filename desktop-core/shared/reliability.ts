export type AnalysisStage =
  | 'capture-permission'
  | 'capture'
  | 'validate-image'
  | 'save-queue'
  | 'compress'
  | 'upload-ticket'
  | 'upload'
  | 'analyze-request'
  | 'parse-result'
  | 'complete'
  | 'auth'
  | 'credits'
  | 'network'
  | 'timeout'
  | 'unknown';

export type DiagnosticAction = 'retry' | 'reselect-source' | 'open-settings' | 'none';

export interface DiagnosticErrorPayload {
  [key: string]: unknown;
  error: string;
  code: string;
  stage: AnalysisStage | string;
  action?: DiagnosticAction;
  operationId?: string;
  requestId?: string;
  attempt?: number;
}

export type VoiceSessionPhase =
  | 'idle'
  | 'authorizing'
  | 'preparing'
  | 'connecting'
  | 'listening'
  | 'reconnecting'
  | 'recovering'
  | 'action-required'
  | 'stopping';

export type ComponentHealth =
  | 'unavailable'
  | 'not-used'
  | 'starting'
  | 'healthy'
  | 'degraded'
  | 'recovering'
  | 'failed';

export interface VoiceHealthSnapshot {
  sessionId: string;
  generation: number;
  desiredRunning: boolean;
  phase: VoiceSessionPhase;
  audioMode: 'demo' | 'formal';
  systemAudio: ComponentHealth;
  microphone: ComponentHealth;
  audioGraph: ComponentHealth;
  asrSocket: ComponentHealth;
  reconnectAttempt: number;
  lastAudioFrameAt?: number;
  lastSystemAudioLevel?: number;
  lastMicrophoneLevel?: number;
  code?: string;
  message?: string;
  action?: DiagnosticAction;
  updatedAt: number;
}

export function createIdleVoiceSnapshot(): VoiceHealthSnapshot {
  return {
    sessionId: '',
    generation: 0,
    desiredRunning: false,
    phase: 'idle',
    audioMode: 'demo',
    systemAudio: 'unavailable',
    microphone: 'unavailable',
    audioGraph: 'unavailable',
    asrSocket: 'unavailable',
    reconnectAttempt: 0,
    action: 'none',
    updatedAt: Date.now(),
  };
}

const VOICE_PHASES = new Set<VoiceSessionPhase>([
  'idle',
  'authorizing',
  'preparing',
  'connecting',
  'listening',
  'reconnecting',
  'recovering',
  'action-required',
  'stopping',
]);

const COMPONENT_HEALTH = new Set<ComponentHealth>([
  'unavailable',
  'not-used',
  'starting',
  'healthy',
  'degraded',
  'recovering',
  'failed',
]);

export function isVoiceHealthSnapshot(value: unknown): value is VoiceHealthSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.sessionId === 'string'
    && typeof record.generation === 'number'
    && typeof record.desiredRunning === 'boolean'
    && VOICE_PHASES.has(record.phase as VoiceSessionPhase)
    && (record.audioMode === 'demo' || record.audioMode === 'formal')
    && COMPONENT_HEALTH.has(record.systemAudio as ComponentHealth)
    && COMPONENT_HEALTH.has(record.microphone as ComponentHealth)
    && COMPONENT_HEALTH.has(record.audioGraph as ComponentHealth)
    && COMPONENT_HEALTH.has(record.asrSocket as ComponentHealth)
    && typeof record.reconnectAttempt === 'number'
    && typeof record.updatedAt === 'number';
}

export function shortDiagnosticId(value?: string): string {
  if (!value) return '';
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '');
  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

export function isVoiceSessionActive(snapshot: VoiceHealthSnapshot): boolean {
  return snapshot.desiredRunning && snapshot.phase !== 'idle' && snapshot.phase !== 'stopping';
}

export function mergeVoiceHealthSnapshot(
  current: VoiceHealthSnapshot,
  next: VoiceHealthSnapshot | Partial<VoiceHealthSnapshot>,
  minimumGeneration: number,
  now = Date.now(),
): VoiceHealthSnapshot {
  const candidate = isVoiceHealthSnapshot(next)
    ? { ...next }
    : { ...current, ...next, updatedAt: now };
  return candidate.generation < minimumGeneration ? current : candidate;
}

export function nextReconnectDelay(attempt: number): number {
  const delays = [500, 1000, 2000, 4000, 5000, 5000];
  return delays[Math.max(0, Math.min(Math.trunc(attempt), delays.length - 1))];
}

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectSupportedImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

export type PermissionCapabilityStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unavailable'
  | 'track-ready'
  | 'verified';

export interface PermissionOnboardingState {
  flowVersion: number;
  completed: boolean;
  skipped: boolean;
  platform: string;
  microphone: PermissionCapabilityStatus;
  screen: PermissionCapabilityStatus;
  systemAudio: PermissionCapabilityStatus;
  microphoneLevel?: number;
  systemAudioLevel?: number;
  updatedAt?: number;
}
