// 实时语音识别 Helper - 使用火山引擎大模型流式ASR API
// 流程: 隐藏窗口采集麦克风 -> WebSocket发送PCM音频 -> 接收识别文本 -> 回调
// API: wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async
// 认证: X-Api-Key + X-Api-Resource-Id + X-Api-Request-Id + X-Api-Connect-Id
// 协议: WebSocket二进制协议 (4字节header + 4字节sequence + 4字节payload_size + payload)
import { BrowserWindow, desktopCapturer, session } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConfigHelper } from '../ConfigHelper';
import { postAction } from '../apiClient';
import type { VoiceHealthSnapshot } from '../../shared/reliability';
import { createIdleVoiceSnapshot, isVoiceHealthSnapshot, mergeVoiceHealthSnapshot } from '../../shared/reliability';
import { DiagnosticLogger } from './DiagnosticLogger';

// 火山引擎语音服务认证信息 - 默认值（可被 OSS 配置覆盖）
const DEFAULT_ASR_WSS_URL = 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async';
const DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration';

export interface AsrConfig {
  wsUrl: string;
  resourceId: string;
  model: string;
  apiKey: string;
  interviewSystemPrompt?: string;
}

export class RealtimeVoiceHelper {
  constructor(private configHelper: ConfigHelper) {}
  private audioWindow: BrowserWindow | null = null;
  private onTextCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private desiredRunning = false;
  private generation = 0;
  private healthSnapshot: VoiceHealthSnapshot = createIdleVoiceSnapshot();
  private onStateCallback: ((snapshot: VoiceHealthSnapshot) => void) | null = null;
  private pollFailures = 0;
  private diagnostics = new DiagnosticLogger();
  private lastHealthLogAt = 0;
  private hiddenWindowRecoveryCount = 0;
  private recoveryInFlight = false;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private asrConfig: AsrConfig = {
    wsUrl: DEFAULT_ASR_WSS_URL,
    resourceId: DEFAULT_RESOURCE_ID,
    model: 'bigmodel',
    apiKey: '',
  };

  /** 从登录后的后端读取 ASR 配置，密钥不再放在公开 OSS 或安装包中。 */
  private async loadAsrConfig(): Promise<void> {
    const token = this.configHelper.getAuthToken();
    if (!token) throw new Error('请先登录后再开始听写');
    const endpoint = this.configHelper.getAppConfig().apiBaseUrl;
    const data = await postAction<AsrConfig>(endpoint, 'getAsrConfig', {}, { token, timeoutMs: 10000 });
    this.asrConfig = { ...data, model: data.model || 'bigmodel' };
    console.log('[RealtimeVoice] ASR config loaded from backend:', { ...this.asrConfig, apiKey: '***' });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize();
    try {
      await this.initializing;
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  private async initialize(): Promise<void> {
    // 从后端加载最新 ASR 配置
    await this.loadAsrConfig();
    let asrUrl: URL;
    try {
      asrUrl = new URL(this.asrConfig.wsUrl || DEFAULT_ASR_WSS_URL);
    } catch {
      throw new Error('实时语音识别地址配置无效，请联系管理员');
    }
    if (asrUrl.protocol !== 'wss:' || !this.asrConfig.resourceId || !this.asrConfig.apiKey) {
      throw new Error('实时语音识别配置不完整，请检查 API Key、Resource-Id 和 WebSocket 地址');
    }

    // 创建独立 session，用于注入 ASR API 鉴权头 + 麦克风权限
    const ses = session.fromPartition('realtime-voice');

    // 允许麦克风权限
    ses.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media');
    });
    ses.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media';
    });
    ses.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] })
        .then((sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
        .catch(() => callback({}));
    });

    // 注入 ASR API 鉴权头到 WebSocket 握手请求
    ses.webRequest.onBeforeSendHeaders(
      { urls: [`${asrUrl.protocol}//${asrUrl.host}/*`] },
      (details, cb) => {
        const headers = { ...details.requestHeaders };
        const requestId = crypto.randomUUID();
        headers['X-Api-Key'] = this.asrConfig.apiKey;
        headers['X-Api-Resource-Id'] = this.asrConfig.resourceId;
        headers['X-Api-Request-Id'] = requestId;
        headers['X-Api-Connect-Id'] = requestId;
        headers['X-Api-Sequence'] = '-1';
        cb({ requestHeaders: headers });
      }
    );

    this.audioWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        session: ses,
        webSecurity: false,
      },
    });

    this.audioWindow.webContents.on('render-process-gone', (_event, details) => {
      this.failHiddenWindow('AUDIO_RENDERER_GONE', `音频采集进程异常退出（${details.reason}）`);
    });
    this.audioWindow.webContents.on('did-fail-load', (_event, code, description) => {
      this.failHiddenWindow('AUDIO_WINDOW_LOAD_FAILED', `音频采集窗口加载失败（${code}: ${description}）`);
    });

    // 注入 ASR 配置到隐藏窗口，写入临时文件用 file:// 加载
    // data: URL 不是安全上下文，navigator.mediaDevices 为 undefined 会导致麦克风采集失败
    const configScript = `window.__ASR_CONFIG__ = ${JSON.stringify({ wsUrl: this.asrConfig.wsUrl, model: this.asrConfig.model })};`;
    const htmlContent = '<script>' + configScript + '</script>' + VOICE_HTML;
    const htmlPath = path.join(os.tmpdir(), 'quizmate-asr-audio.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    await this.audioWindow.loadURL('file://' + htmlPath);
  }

  /** 开始实时语音识别 */
  async start(
    onText: (text: string, isFinal: boolean) => void,
    onError?: (error: string) => void,
    options: { audioMode?: 'demo' | 'formal'; onState?: (snapshot: VoiceHealthSnapshot) => void; recovery?: boolean } = {}
  ): Promise<void> {
    await this.init();
    if (!this.audioWindow || this.audioWindow.isDestroyed()) {
      throw new Error('实时语音识别窗口未准备完成');
    }
    if (this.desiredRunning) return;
    this.onTextCallback = onText;
    this.onErrorCallback = onError ?? null;
    this.onStateCallback = options.onState ?? null;
    if (!options.recovery) this.hiddenWindowRecoveryCount = 0;
    this.desiredRunning = true;
    this.generation += 1;
    const sessionId = crypto.randomUUID();

    // 启动隐藏窗口中的识别
    const audioMode = options.audioMode === 'formal' ? 'formal' : 'demo';
    this.updateHealth({
      sessionId,
      generation: this.generation,
      desiredRunning: true,
      phase: 'authorizing',
      audioMode,
      systemAudio: 'starting',
      microphone: audioMode === 'demo' ? 'starting' : 'not-used',
      audioGraph: 'starting',
      asrSocket: 'starting',
      reconnectAttempt: 0,
      code: undefined,
      message: '正在请求音频权限',
      action: 'none',
    });
    this.diagnostics.append('interview-audio', 'session.start', { sessionId, generation: this.generation, audioMode });
    await this.audioWindow.webContents.executeJavaScript(
      `void startListening(${JSON.stringify(audioMode)}, ${JSON.stringify(sessionId)}, ${this.generation}); true`,
      true,
    ).catch((e) => {
      this.desiredRunning = false;
      console.error('[RealtimeVoice] start error:', e);
      throw new Error(e?.message || '启动语音识别失败');
    });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const startup = await this.audioWindow.webContents.executeJavaScript('getStartupState()', true) as {
        state: string;
        stage: string;
        error: string;
        health?: unknown;
      };
      if (isVoiceHealthSnapshot(startup.health)) this.updateHealth(startup.health);
      if (this.healthSnapshot.phase === 'listening') break;
      if (startup.error) {
        this.desiredRunning = false;
        await this.audioWindow.webContents.executeJavaScript('stopListening(false)', true).catch(() => {});
        throw new Error(startup.error);
      }
      if (startup.state === 'closed' || startup.state === 'error') {
        this.desiredRunning = false;
        throw new Error('火山引擎实时语音连接被拒绝，请检查专属 API Key、Resource-Id 和模型授权');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!this.desiredRunning || Date.now() >= deadline) {
      this.desiredRunning = false;
      this.audioWindow.webContents.executeJavaScript('stopListening()', true).catch(() => {});
      const startup = await this.audioWindow.webContents.executeJavaScript('getStartupState()', true).catch(() => null);
      const stage = startup && startup.stage ? startup.stage : 'connect-asr';
      if (stage === 'capture-system') {
        throw new Error('等待系统音频授权超时，请在系统共享窗口中选择屏幕并开启音频共享');
      }
      if (stage === 'capture-microphone') {
        throw new Error('等待麦克风授权超时，请在系统设置中允许 QuizMate 使用麦克风');
      }
      throw new Error('火山引擎实时语音连接超时，请检查网络和后台模型配置');
    }

    // 轮询获取识别结果
    this.pollTimer = setInterval(() => {
      if (!this.desiredRunning || !this.audioWindow || this.audioWindow.isDestroyed()) return;
      this.audioWindow.webContents
        .executeJavaScript('({ results: getPendingResults(), health: getVoiceHealthSnapshot() })', true)
        .then((payload: { results?: Array<{ text: string; isFinal: boolean; error?: string }>; health?: unknown } | null) => {
          this.pollFailures = 0;
          if (isVoiceHealthSnapshot(payload?.health)) this.updateHealth(payload.health);
          const results = payload?.results;
          if (!results || results.length === 0) return;
          for (const r of results) {
            if (r.error) {
              this.onErrorCallback?.(r.error);
            } else {
              this.onTextCallback?.(r.text, r.isFinal);
            }
          }
        })
        .catch((error) => {
          this.pollFailures += 1;
          this.diagnostics.append('interview-audio', 'poll.error', {
            sessionId: this.healthSnapshot.sessionId,
            generation: this.generation,
            pollFailures: this.pollFailures,
            message: error instanceof Error ? error.message : String(error),
          });
          if (this.pollFailures >= 3) {
            this.failHiddenWindow('AUDIO_WINDOW_UNRESPONSIVE', '音频采集窗口无响应，请点击重试');
          }
        });
    }, 200);
  }

  /** 停止识别 */
  stop(graceful = true): void {
    this.desiredRunning = false;
    this.updateHealth({ desiredRunning: false, phase: 'stopping', message: '正在停止听写', action: 'none' });
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.audioWindow?.webContents.executeJavaScript(`stopListening(${graceful ? 'true' : 'false'})`, true)
      .catch(() => {})
      .finally(() => this.updateHealth(createIdleVoiceSnapshot()));
    this.onTextCallback = null;
    this.onErrorCallback = null;
    this.onStateCallback = null;
  }

  isRunning(): boolean {
    return this.desiredRunning;
  }

  getHealthSnapshot(): VoiceHealthSnapshot {
    return { ...this.healthSnapshot };
  }

  async retry(): Promise<void> {
    if (!this.onTextCallback) throw new Error('当前没有可恢复的听写会话');
    const onText = this.onTextCallback;
    const onError = this.onErrorCallback ?? undefined;
    const onState = this.onStateCallback ?? undefined;
    const audioMode = this.healthSnapshot.audioMode;
    this.stop(false);
    if (this.audioWindow?.isDestroyed()) {
      this.audioWindow = null;
      this.initialized = false;
    }
    await this.start(onText, onError, { audioMode, onState });
  }

  copyDiagnosticSummary(): boolean {
    return this.diagnostics.copySummary({ kind: 'interview-audio', ...this.healthSnapshot });
  }

  openDiagnosticFolder(): Promise<boolean> {
    return this.diagnostics.openFolder();
  }

  /** 获取面试系统提示词（从 OSS 配置读取） */
  getInterviewSystemPrompt(): string | undefined {
    return this.asrConfig.interviewSystemPrompt;
  }

  getPublicConfig(): Pick<AsrConfig, 'wsUrl' | 'resourceId' | 'model'> {
    const { wsUrl, resourceId, model } = this.asrConfig;
    return { wsUrl, resourceId, model };
  }

  destroy(): void {
    this.stop();
    if (this.audioWindow && !this.audioWindow.isDestroyed()) {
      this.audioWindow.destroy();
    }
    this.audioWindow = null;
    this.initialized = false;
  }

  private updateHealth(next: VoiceHealthSnapshot | Partial<VoiceHealthSnapshot>): void {
    const previous = this.healthSnapshot;
    const candidate = mergeVoiceHealthSnapshot(this.healthSnapshot, next, this.generation);
    if (candidate === this.healthSnapshot) return;
    const changed = JSON.stringify(candidate) !== JSON.stringify(this.healthSnapshot);
    this.healthSnapshot = candidate;
    if (!changed) return;
    this.onStateCallback?.({ ...candidate });
    const materialChange = previous.sessionId !== candidate.sessionId
      || previous.phase !== candidate.phase
      || previous.systemAudio !== candidate.systemAudio
      || previous.microphone !== candidate.microphone
      || previous.audioGraph !== candidate.audioGraph
      || previous.asrSocket !== candidate.asrSocket
      || previous.reconnectAttempt !== candidate.reconnectAttempt
      || previous.code !== candidate.code
      || previous.action !== candidate.action;
    if (!materialChange && Date.now() - this.lastHealthLogAt < 10_000) return;
    this.lastHealthLogAt = Date.now();
    this.diagnostics.append('interview-audio', 'state.changed', {
      sessionId: candidate.sessionId,
      generation: candidate.generation,
      phase: candidate.phase,
      systemAudio: candidate.systemAudio,
      microphone: candidate.microphone,
      audioGraph: candidate.audioGraph,
      asrSocket: candidate.asrSocket,
      reconnectAttempt: candidate.reconnectAttempt,
      code: candidate.code,
      message: candidate.message,
    });
  }

  private failHiddenWindow(code: string, message: string): void {
    if (!this.desiredRunning) return;
    if (this.hiddenWindowRecoveryCount < 1 && !this.recoveryInFlight && this.onTextCallback) {
      this.hiddenWindowRecoveryCount += 1;
      this.updateHealth({
        phase: 'recovering',
        audioGraph: 'recovering',
        asrSocket: 'recovering',
        code,
        message: '音频采集窗口异常，正在自动重建…',
        action: 'none',
      });
      void this.recoverHiddenWindow();
      return;
    }
    this.updateHealth({
      phase: 'action-required',
      audioGraph: 'failed',
      asrSocket: 'failed',
      code,
      message,
      action: 'retry',
    });
    this.onErrorCallback?.(message);
  }

  private async recoverHiddenWindow(): Promise<void> {
    if (this.recoveryInFlight || !this.onTextCallback) return;
    this.recoveryInFlight = true;
    const onText = this.onTextCallback;
    const onError = this.onErrorCallback ?? undefined;
    const onState = this.onStateCallback ?? undefined;
    const audioMode = this.healthSnapshot.audioMode;
    this.desiredRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.audioWindow && !this.audioWindow.isDestroyed()) this.audioWindow.destroy();
    this.audioWindow = null;
    this.initialized = false;
    try {
      await this.start(onText, onError, { audioMode, onState, recovery: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.updateHealth({
        desiredRunning: true,
        phase: 'action-required',
        audioGraph: 'failed',
        asrSocket: 'failed',
        code: 'AUDIO_WINDOW_RECOVERY_FAILED',
        message: detail,
        action: 'retry',
      });
      onError?.(detail);
    } finally {
      this.recoveryInFlight = false;
    }
  }
}

// 隐藏窗口的HTML：麦克风采集 + WebSocket ASR + 二进制协议
// 大模型流式ASR二进制协议:
//   Full client request:  header(4B) + sequence(4B) + payload_size(4B) + GZIP(JSON)
//   Audio only request:   header(4B) + sequence(4B, >0 or negative) + payload_size(4B) + GZIP(PCM)
//   Server response:      variable header fields + payload_size(4B) + payload
const VOICE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
let ws = null;
let audioContext = null;
let mediaStream = null;
let captureStreams = [];
let sourceNodes = [];
let sourceNode = null;
let processorNode = null;
let pendingResults = [];
let isListening = false;
let seqNum = 1;
let audioSendQueue = Promise.resolve();
let needsWavHeader = true;
let keepSession = false;
let reconnectTimer = null;
let reconnectDelay = 500;
let reconnectAttempt = 0;
let socketGeneration = 0;
let startupStage = 'idle';
let startupError = '';
let currentSessionId = '';
let currentGeneration = 0;
let currentAudioMode = 'demo';
let audioLevelTimer = null;
let sourceAnalysers = [];
let healthState = {
  sessionId: '', generation: 0, desiredRunning: false, phase: 'idle', audioMode: 'demo',
  systemAudio: 'unavailable', microphone: 'unavailable', audioGraph: 'unavailable',
  asrSocket: 'unavailable', reconnectAttempt: 0, action: 'none', updatedAt: Date.now()
};

function updateHealth(patch) {
  healthState = { ...healthState, ...patch, updatedAt: Date.now() };
}

function getVoiceHealthSnapshot() {
  return { ...healthState };
}

function trackHealth(track, kind) {
  track.addEventListener('ended', () => {
    if (!keepSession) return;
    updateHealth({
      phase: 'action-required',
      [kind]: 'failed',
      code: kind === 'systemAudio' ? 'SYSTEM_AUDIO_TRACK_ENDED' : 'MICROPHONE_TRACK_ENDED',
      message: kind === 'systemAudio' ? '系统音频共享已结束，请重新选择共享源' : '麦克风音轨已结束，请检查权限后重试',
      action: kind === 'systemAudio' ? 'reselect-source' : 'retry'
    });
  });
  track.addEventListener('mute', () => {
    if (keepSession) updateHealth({ [kind]: 'degraded', message: '音轨暂时静音，仍在保持会话' });
  });
  track.addEventListener('unmute', () => {
    if (keepSession) updateHealth({ [kind]: 'healthy', message: '音轨已恢复' });
  });
}

// ===== 二进制协议构造 =====
function makeHeader(msgType, flags, serialization, compression) {
  return new Uint8Array([
    0x11, // version=1, header_size=1 (4 bytes)
    (msgType << 4) | flags,
    (serialization << 4) | compression,
    0x00  // reserved
  ]);
}

function int32BE(val) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, val, false); // big-endian signed
  return new Uint8Array(buf);
}

function uint32BE(val) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, val, false); // big-endian unsigned
  return new Uint8Array(buf);
}

function concatBuffers(...arrays) {
  let totalLength = 0;
  for (const a of arrays) totalLength += a.byteLength;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    const bytes = a instanceof Uint8Array ? a : new Uint8Array(a);
    result.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return result;
}

function makeStreamingWavHeader() {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const writeAscii = (offset, value) => {
    for (let i = 0; i < value.length; i++) header[offset + i] = value.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 0x7FFFFFFF, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, 0x7FFFFFFF, true);
  return header;
}

async function gzipBytes(input) {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(input) {
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 发送 full client request (JSON 配置)
// msg_type=0x01, flags=0x01 (positive sequence), serialization=JSON, compression=GZIP
async function sendFullClientRequest(config) {
  const payloadStr = JSON.stringify(config);
  const payloadBytes = await gzipBytes(new TextEncoder().encode(payloadStr));
  const header = makeHeader(0x01, 0x01, 0x01, 0x01);
  const sequence = int32BE(seqNum++);
  const size = uint32BE(payloadBytes.byteLength);
  const msg = concatBuffers(header, sequence, size, payloadBytes);
  ws.send(msg);
  console.log('[ASR] Sent full client request:', payloadStr);
}

// 发送音频数据
// msg_type=0x02, serialization=raw, compression=GZIP
async function sendAudioData(pcmBuffer, isLast) {
  const compressed = await gzipBytes(pcmBuffer);
  const header = makeHeader(0x02, isLast ? 0x03 : 0x01, 0x00, 0x01);
  const seq = int32BE(isLast ? -seqNum : seqNum);
  if (!isLast) seqNum++;
  const size = uint32BE(compressed.byteLength);
  const msg = concatBuffers(header, seq, size, compressed);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function enqueueAudioData(pcmBuffer, isLast) {
  audioSendQueue = audioSendQueue
    .then(() => sendAudioData(pcmBuffer, isLast))
    .catch((error) => {
      console.error('[ASR] Audio send error:', error);
      pendingResults.push({ text: '', isFinal: false, error: '语音数据发送失败，请重试' });
    });
  return audioSendQueue;
}

// 解析服务端响应
async function parseResponse(data) {
  const bytes = new Uint8Array(data);
  if (bytes.length < 4) return null;

  const headerSize = (bytes[0] & 0x0F) * 4;
  const msgType = (bytes[1] >> 4) & 0x0F;
  const flags = bytes[1] & 0x0F;
  const serialization = (bytes[2] >> 4) & 0x0F;
  const compression = bytes[2] & 0x0F;
  if (headerSize < 4 || bytes.length < headerSize) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = headerSize;
  let sequence = 0;
  let event = 0;
  let code = 0;
  if (flags & 0x01) {
    if (bytes.length < offset + 4) return null;
    sequence = view.getInt32(offset, false);
    offset += 4;
  }
  const isLastPacket = Boolean(flags & 0x02);
  if (flags & 0x04) {
    if (bytes.length < offset + 4) return null;
    event = view.getInt32(offset, false);
    offset += 4;
  }

  if (msgType === 0x0F) {
    if (bytes.length < offset + 8) return null;
    code = view.getUint32(offset, false);
    offset += 4;
  }
  if (bytes.length < offset + 4) return null;
  const payloadSize = view.getUint32(offset, false);
  offset += 4;
  if (payloadSize === 0 || bytes.length < offset + payloadSize) {
    return msgType === 0x0F ? { type: 'error', error: '语音识别服务错误：' + code } : null;
  }

  let payloadBytes = bytes.slice(offset, offset + payloadSize);
  if (compression === 0x01) {
    try {
      payloadBytes = await gunzipBytes(payloadBytes);
    } catch (error) {
      console.error('[ASR] GZIP decompress error:', error);
      return { type: 'error', error: '语音识别响应解压失败' };
    }
  }
  const payloadStr = new TextDecoder().decode(payloadBytes);
  let payload = payloadStr;
  if (serialization === 0x01) {
    try { payload = JSON.parse(payloadStr); } catch {}
  }

  if (msgType === 0x0F) {
    const detail = typeof payload === 'object' && payload
      ? (payload.error || payload.message || payload.msg || JSON.stringify(payload))
      : payloadStr;
    return { type: 'error', error: '语音识别服务错误 ' + code + '：' + detail };
  } else if (msgType === 0x09) {
    try {
      const resp = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const resultPayload = resp.result || (resp.payload_msg && resp.payload_msg.result) || null;
      const utterances = Array.isArray(resultPayload && resultPayload.utterances)
        ? resultPayload.utterances
        : [];
      const latestUtterance = utterances.length > 0 ? utterances[utterances.length - 1] : null;
      let text = '';

      if (latestUtterance) {
        text = latestUtterance.text || latestUtterance.transcript || '';
      }
      if (!text && resp.result) {
        if (resp.result.text) text = resp.result.text;
        else if (resp.result.transcript) text = resp.result.transcript;
      }
      if (!text && resp.text) text = resp.text;
      if (resp.payload_msg && resp.payload_msg.result) {
        text = text || resp.payload_msg.result.text || '';
      }

      const utteranceIsFinal = latestUtterance && (
        latestUtterance.definite === true || latestUtterance.definite === 1 || latestUtterance.definite === 'true'
        || latestUtterance.is_final === true || latestUtterance.isFinal === true
      );
      const isFinal = Boolean(isLastPacket || utteranceIsFinal || resp.is_last === true || resp.isLast === true || resp.is_final === true
        || resp.result?.is_final === true || resp.result?.isFinal === true
        || resp.payload_msg?.result?.is_final === true);
      return { type: 'response', text, isFinal, sequence, event };
    } catch (e) {
      console.log('[ASR] Parse error:', e, payloadStr.substring(0, 200));
      return null;
    }
  }
  return null;
}

// The ASR service may close a streaming socket after a finalized utterance or
// after a transient network hiccup. Keep the existing capture graph alive and
// replace only the socket so the next interview question is not lost and the
// user is not asked for microphone/screen permission again.
function scheduleSocketReconnect() {
  if (!keepSession || reconnectTimer || !audioContext || !processorNode) return;
  if (reconnectAttempt >= 6) {
    startupError = '语音识别连续重连失败，请检查网络后点击重试';
    updateHealth({ phase: 'action-required', asrSocket: 'failed', reconnectAttempt, code: 'ASR_RECONNECT_EXHAUSTED', message: startupError, action: 'retry' });
    pendingResults.push({ text: '', isFinal: false, error: startupError });
    return;
  }
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  reconnectAttempt += 1;
  updateHealth({ phase: 'reconnecting', asrSocket: 'recovering', reconnectAttempt, message: '语音识别连接中断，正在自动重连…', action: 'none' });
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!keepSession || !audioContext || !processorNode) return;
    const asrWsUrl = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.wsUrl) || 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async';
    const asrModel = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.model) || 'bigmodel';
    const reconnectWs = new WebSocket(asrWsUrl);
    const reconnectGeneration = ++socketGeneration;
    reconnectWs.binaryType = 'arraybuffer';
    ws = reconnectWs;
    seqNum = 1;
    needsWavHeader = true;
    audioSendQueue = Promise.resolve();

    reconnectWs.onopen = async () => {
      if (ws !== reconnectWs || reconnectGeneration !== socketGeneration || !keepSession) return;
      try {
        await sendFullClientRequest({
          user: { uid: 'interview_helper' },
          audio: { format: 'wav', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
          request: { model_name: asrModel || 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: false },
        });
        isListening = true;
        updateHealth({ phase: 'reconnecting', asrSocket: 'recovering', message: '语音识别已重新连接，正在确认数据通道…', action: 'none' });
      } catch (error) {
        console.error('[ASR] Reconnect full request error:', error);
        try { reconnectWs.close(); } catch {}
      }
    };
    reconnectWs.onmessage = async (e) => {
      if (ws !== reconnectWs || reconnectGeneration !== socketGeneration) return;
      const result = await parseResponse(e.data);
      if (!result) return;
      if (result.type === 'error') {
        pendingResults.push({ text: '', isFinal: false, error: result.error });
      } else if (result.type === 'response') {
        reconnectDelay = 500;
        reconnectAttempt = 0;
        updateHealth({ phase: 'listening', asrSocket: 'healthy', reconnectAttempt: 0, code: undefined, message: '听写已恢复', action: 'none' });
        if (result.text) pendingResults.push({ text: result.text, isFinal: result.isFinal });
      }
    };
    reconnectWs.onerror = () => {
      if (ws === reconnectWs && reconnectGeneration === socketGeneration) {
        updateHealth({ phase: 'reconnecting', asrSocket: 'recovering', message: '语音识别服务连接失败，正在重连…' });
      }
    };
    reconnectWs.onclose = () => {
      if (ws !== reconnectWs || reconnectGeneration !== socketGeneration) return;
      isListening = false;
      if (keepSession) scheduleSocketReconnect();
    };
  }, delay);
}

// ===== 麦克风采集 + WebSocket ASR =====
async function startListening(audioMode = 'demo', sessionId = '', generation = 0) {
  if (keepSession) return;
  keepSession = true;
  currentSessionId = sessionId;
  currentGeneration = generation;
  currentAudioMode = audioMode;
  reconnectDelay = 500;
  reconnectAttempt = 0;
  pendingResults = [];
  startupStage = 'capture-system';
  startupError = '';
  seqNum = 1;
  audioSendQueue = Promise.resolve();
  needsWavHeader = true;
  updateHealth({
    sessionId, generation, desiredRunning: true, phase: 'authorizing', audioMode,
    systemAudio: 'starting', microphone: audioMode === 'demo' ? 'starting' : 'not-used',
    audioGraph: 'starting', asrSocket: 'starting', reconnectAttempt: 0,
    code: undefined, message: '正在请求音频权限', action: 'none'
  });

  try {
    // Formal mode captures only meeting/speaker audio. Demo mode mixes microphone and speaker audio.
    captureStreams = [];
    let systemCaptureError = '';
    try {
      // Chromium/macOS may bind loopback audio lifetime to the display carrier
      // video track. Keep every carrier track alive until stopListening().
      const systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (systemStream.getAudioTracks().length > 0) {
        systemStream.getAudioTracks().forEach(track => trackHealth(track, 'systemAudio'));
        systemStream.getVideoTracks().forEach(track => trackHealth(track, 'systemAudio'));
        captureStreams.push(systemStream);
        updateHealth({ systemAudio: 'healthy', phase: 'preparing', message: '系统音频轨已建立' });
      } else {
        systemStream.getTracks().forEach(track => track.stop());
        systemCaptureError = '未获取到电脑声音，请在系统设置中允许 QuizMate 录制系统音频';
      }
    } catch (error) {
      systemCaptureError = error && error.message ? error.message : String(error);
    }
    if (audioMode === 'formal' && captureStreams.length === 0) {
      throw new Error(systemCaptureError || '未获取到电脑声音，请检查系统音频录制权限');
    }
    if (audioMode === 'demo') {
      startupStage = 'capture-microphone';
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      microphoneStream.getAudioTracks().forEach(track => trackHealth(track, 'microphone'));
      captureStreams.push(microphoneStream);
      updateHealth({ microphone: 'healthy', phase: 'preparing', message: '麦克风音轨已建立' });
      if (systemCaptureError) {
        pendingResults.push({ text: '', isFinal: false, error: '未能采集系统音频，演示模式已自动改用麦克风：' + systemCaptureError });
      }
    }

    startupStage = 'prepare-audio';
    // 2. 创建 AudioContext (浏览器实际采样率可能是48k，我们做重采样)
    audioContext = new AudioContext();
    audioContext.onstatechange = async () => {
      if (!keepSession || !audioContext) return;
      if (audioContext.state === 'running') {
        updateHealth({ audioGraph: 'healthy', phase: ws && ws.readyState === WebSocket.OPEN ? 'listening' : healthState.phase, message: '音频处理已恢复' });
        return;
      }
      updateHealth({ phase: 'recovering', audioGraph: 'recovering', code: 'AUDIO_CONTEXT_' + String(audioContext.state).toUpperCase(), message: '音频处理被系统暂停，正在恢复…', action: 'none' });
      try {
        await audioContext.resume();
        if (audioContext.state === 'running') updateHealth({ audioGraph: 'healthy', code: undefined, message: '音频处理已恢复', action: 'none' });
      } catch (error) {
        updateHealth({ phase: 'action-required', audioGraph: 'failed', code: 'AUDIO_CONTEXT_RESUME_FAILED', message: '音频处理恢复失败，请点击重试', action: 'retry' });
      }
    };
    const actualSampleRate = audioContext.sampleRate;
    console.log('[ASR] AudioContext sample rate:', actualSampleRate);

    if (captureStreams.length === 1) {
      mediaStream = captureStreams[0];
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNodes = [sourceNode];
    } else {
      const mixedDestination = audioContext.createMediaStreamDestination();
      sourceNodes = captureStreams.map(stream => {
        const node = audioContext.createMediaStreamSource(stream);
        node.connect(mixedDestination);
        return node;
      });
      mediaStream = mixedDestination.stream;
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
    }
    sourceAnalysers = sourceNodes.map((node) => {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      node.connect(analyser);
      return analyser;
    });
    audioLevelTimer = setInterval(() => {
      if (!keepSession || sourceAnalysers.length === 0) return;
      const levels = sourceAnalysers.map((analyser) => {
        const bins = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(bins);
        let sum = 0;
        for (const value of bins) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
        return Math.sqrt(sum / bins.length);
      });
      const systemLevel = levels[0] || 0;
      const microphoneLevel = audioMode === 'demo' ? (levels[1] || 0) : 0;
      const active = Math.max(systemLevel, microphoneLevel) > 0.004;
      updateHealth({
        lastSystemAudioLevel: systemLevel,
        lastMicrophoneLevel: microphoneLevel,
        ...(active ? { lastAudioFrameAt: Date.now() } : {})
      });
    }, 500);
    // 4096 samples buffer
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    // 3. 连接 WebSocket（使用注入的配置）
    const asrWsUrl = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.wsUrl) || 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async';
    const asrModel = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.model) || 'bigmodel';
    startupStage = 'connect-asr';
    updateHealth({ phase: 'connecting', audioGraph: 'healthy', asrSocket: 'starting', message: '正在连接语音识别服务' });
    ws = new WebSocket(asrWsUrl);
    const initialWs = ws;
    const initialGeneration = ++socketGeneration;
    initialWs.binaryType = 'arraybuffer';

    initialWs.onopen = async () => {
      if (ws !== initialWs || initialGeneration !== socketGeneration || !keepSession) return;
      console.log('[ASR] WebSocket connected to:', asrWsUrl);
      try {
        await sendFullClientRequest({
          user: { uid: 'interview_helper' },
          audio: {
            format: 'wav',
            codec: 'raw',
            rate: 16000,
            bits: 16,
            channel: 1,
          },
          request: {
            model_name: asrModel || 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            show_utterances: true,
            enable_nonstream: false,
          },
        });
        isListening = true;
        startupStage = 'open';
        updateHealth({ phase: 'listening', audioGraph: 'healthy', asrSocket: 'healthy', reconnectAttempt: 0, code: undefined, message: '正在听写', action: 'none' });
      } catch (error) {
        console.error('[ASR] Full request error:', error);
        pendingResults.push({ text: '', isFinal: false, error: '语音识别初始化请求发送失败' });
        try { initialWs.close(); } catch {}
        return;
      }

      // 开始发送音频
      processorNode.onaudioprocess = (e) => {
        if (!isListening || !ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // 如果实际采样率不是16kHz，做简单的降采样
        let pcm16;
        if (actualSampleRate !== 16000) {
          const ratio = actualSampleRate / 16000;
          const newLen = Math.floor(inputData.length / ratio);
          pcm16 = new Int16Array(newLen);
          for (let i = 0; i < newLen; i++) {
            const srcIdx = Math.floor(i * ratio);
            const s = Math.max(-1, Math.min(1, inputData[srcIdx]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        } else {
          pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        }

        let audioPayload = pcm16.buffer;
        if (needsWavHeader) {
          audioPayload = concatBuffers(makeStreamingWavHeader(), new Uint8Array(pcm16.buffer));
          needsWavHeader = false;
        }
        enqueueAudioData(audioPayload, false);
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
    };

    initialWs.onmessage = async (e) => {
      if (ws !== initialWs || initialGeneration !== socketGeneration) return;
      const result = await parseResponse(e.data);
      if (!result) return;
      if (result.type === 'error') {
        console.error('[ASR] Error:', result.error);
        pendingResults.push({ text: '', isFinal: false, error: result.error });
      } else if (result.type === 'response') {
        if (result.text) {
          console.log('[ASR] Result:', result.text, 'isFinal:', result.isFinal);
          pendingResults.push({ text: result.text, isFinal: result.isFinal });
        }
      }
    };

    initialWs.onerror = (e) => {
      if (ws !== initialWs || initialGeneration !== socketGeneration) return;
      console.error('[ASR] WebSocket error:', e);
      startupError = '语音识别服务连接失败，请检查网络和后台模型配置';
      updateHealth({ phase: 'reconnecting', asrSocket: 'recovering', message: startupError, action: 'none' });
    };

    initialWs.onclose = (e) => {
      if (ws !== initialWs || initialGeneration !== socketGeneration) return;
      console.log('[ASR] WebSocket closed:', e.code, e.reason);
      if (keepSession) scheduleSocketReconnect();
      isListening = false;
    };

  } catch (e) {
    console.error('[ASR] Start error:', e);
    const detail = e && e.message ? e.message : String(e);
    if (startupStage === 'capture-system') {
      startupError = '系统音频采集失败：' + detail;
    } else if (startupStage === 'capture-microphone') {
      startupError = '麦克风采集失败：' + detail;
    } else {
      startupError = '实时语音启动失败：' + detail;
    }
    keepSession = false;
    updateHealth({
      desiredRunning: false, phase: 'action-required',
      systemAudio: healthState.systemAudio === 'starting' ? 'failed' : healthState.systemAudio,
      microphone: healthState.microphone === 'starting' ? 'failed' : healthState.microphone,
      audioGraph: 'failed', asrSocket: 'failed', code: 'VOICE_START_FAILED',
      message: startupError, action: startupStage === 'capture-system' ? 'reselect-source' : 'retry'
    });
    pendingResults.push({ text: '', isFinal: false, error: startupError });
  }
}

async function stopListening(graceful = true) {
  keepSession = false;
  updateHealth({ desiredRunning: false, phase: 'stopping', message: '正在停止听写', action: 'none' });
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isListening = false;
  if (audioLevelTimer) {
    clearInterval(audioLevelTimer);
    audioLevelTimer = null;
  }
  sourceAnalysers.forEach(analyser => { try { analyser.disconnect(); } catch {} });
  sourceAnalysers = [];

  // 发送最后一包（负包，标记结束）
  if (graceful && ws && ws.readyState === WebSocket.OPEN) {
    try {
      await enqueueAudioData(new ArrayBuffer(0), true);
      console.log('[ASR] Sent last audio packet');
    } catch (e) {
      console.error('[ASR] Error sending last packet:', e);
    }
  }

  // 关闭音频处理
  if (processorNode) {
    try { processorNode.disconnect(); } catch {}
    processorNode = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  sourceNodes.forEach(node => { try { node.disconnect(); } catch {} });
  sourceNodes = [];
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  captureStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
  captureStreams = [];
  if (audioContext) {
    audioContext.onstatechange = null;
    try { audioContext.close(); } catch {}
    audioContext = null;
  }

  // 延迟关闭旧 WebSocket，等待最后的响应；重启采集时不能误关新连接。
  const closingWs = ws;
  setTimeout(() => {
    if (ws === closingWs && closingWs) {
      try { closingWs.close(); } catch {}
      ws = null;
    }
  }, 1500);
  updateHealth({
    sessionId: '', generation: currentGeneration, desiredRunning: false, phase: 'idle', audioMode: currentAudioMode,
    systemAudio: 'unavailable', microphone: 'unavailable', audioGraph: 'unavailable',
    asrSocket: 'unavailable', reconnectAttempt: 0, lastAudioFrameAt: undefined,
    lastSystemAudioLevel: undefined, lastMicrophoneLevel: undefined,
    code: undefined, message: undefined, action: 'none'
  });
}

function getPendingResults() {
  const results = pendingResults;
  pendingResults = [];
  return results;
}

function getConnectionState() {
  if (!ws) return 'connecting';
  if (ws.readyState === WebSocket.OPEN && isListening) return 'open';
  if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return 'closed';
  return 'connecting';
}

function getStartupState() {
  return {
    state: getConnectionState(),
    stage: startupStage,
    error: startupError,
    health: getVoiceHealthSnapshot(),
  };
}
</script>
</body></html>`;
