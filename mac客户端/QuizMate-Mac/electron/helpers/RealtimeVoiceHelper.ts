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
  private running = false;
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
        .then((sources) => callback(sources[0] ? { video: sources[0] } : {}))
        .catch(() => callback({}));
    }, { useSystemPicker: process.platform === 'darwin' });

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
    options: { audioMode?: 'demo' | 'formal' } = {}
  ): Promise<void> {
    await this.init();
    if (!this.audioWindow || this.audioWindow.isDestroyed()) {
      throw new Error('实时语音识别窗口未准备完成');
    }
    if (this.running) return;
    this.onTextCallback = onText;
    this.onErrorCallback = onError ?? null;
    this.running = true;

    // 启动隐藏窗口中的识别
    const audioMode = options.audioMode === 'formal' ? 'formal' : 'demo';
    await this.audioWindow.webContents.executeJavaScript(`void startListening(${JSON.stringify(audioMode)}); true`, true).catch((e) => {
      this.running = false;
      console.error('[RealtimeVoice] start error:', e);
      throw new Error(e?.message || '启动语音识别失败');
    });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const startup = await this.audioWindow.webContents.executeJavaScript('getStartupState()', true) as {
        state: string;
        stage: string;
        error: string;
      };
      if (startup.state === 'open') break;
      if (startup.error) {
        this.running = false;
        await this.audioWindow.webContents.executeJavaScript('stopListening(false)', true).catch(() => {});
        throw new Error(startup.error);
      }
      if (startup.state === 'closed' || startup.state === 'error') {
        this.running = false;
        throw new Error('火山引擎实时语音连接被拒绝，请检查专属 API Key、Resource-Id 和模型授权');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!this.running || Date.now() >= deadline) {
      this.running = false;
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
      if (!this.running || !this.audioWindow || this.audioWindow.isDestroyed()) return;
      this.audioWindow.webContents
        .executeJavaScript('getPendingResults()', true)
        .then((results: Array<{ text: string; isFinal: boolean; error?: string }> | null) => {
          if (!results || results.length === 0) return;
          for (const r of results) {
            if (r.error) {
              this.onErrorCallback?.(r.error);
            } else {
              this.onTextCallback?.(r.text, r.isFinal);
            }
          }
        })
        .catch(() => {});
    }, 200);
  }

  /** 停止识别 */
  stop(graceful = true): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.audioWindow?.webContents.executeJavaScript(`stopListening(${graceful ? 'true' : 'false'})`, true).catch(() => {});
    this.onTextCallback = null;
    this.onErrorCallback = null;
  }

  isRunning(): boolean {
    return this.running;
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
let startupStage = 'idle';
let startupError = '';

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
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!keepSession || !audioContext || !processorNode) return;
    const asrWsUrl = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.wsUrl) || 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async';
    const asrModel = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.model) || 'bigmodel';
    const reconnectWs = new WebSocket(asrWsUrl);
    reconnectWs.binaryType = 'arraybuffer';
    ws = reconnectWs;
    seqNum = 1;
    needsWavHeader = true;
    audioSendQueue = Promise.resolve();

    reconnectWs.onopen = async () => {
      if (ws !== reconnectWs || !keepSession) return;
      try {
        await sendFullClientRequest({
          user: { uid: 'interview_helper' },
          audio: { format: 'wav', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
          request: { model_name: asrModel || 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: false },
        });
        reconnectDelay = 500;
        isListening = true;
      } catch (error) {
        console.error('[ASR] Reconnect full request error:', error);
        try { reconnectWs.close(); } catch {}
      }
    };
    reconnectWs.onmessage = async (e) => {
      if (ws !== reconnectWs) return;
      const result = await parseResponse(e.data);
      if (!result) return;
      if (result.type === 'error') {
        pendingResults.push({ text: '', isFinal: false, error: result.error });
      } else if (result.type === 'response' && result.text) {
        pendingResults.push({ text: result.text, isFinal: result.isFinal });
      }
    };
    reconnectWs.onerror = () => {
      if (ws === reconnectWs) pendingResults.push({ text: '', isFinal: false, error: '语音识别服务连接失败，正在重连…' });
    };
    reconnectWs.onclose = () => {
      if (ws !== reconnectWs) return;
      isListening = false;
      if (keepSession) scheduleSocketReconnect();
    };
  }, delay);
}

// ===== 麦克风采集 + WebSocket ASR =====
async function startListening(audioMode = 'demo') {
  if (isListening) return;
  keepSession = true;
  reconnectDelay = 500;
  pendingResults = [];
  startupStage = 'capture-system';
  startupError = '';
  seqNum = 1;
  audioSendQueue = Promise.resolve();
  needsWavHeader = true;

  try {
    // Formal mode captures only meeting/speaker audio. Demo mode mixes microphone and speaker audio.
    captureStreams = [];
    let systemCaptureError = '';
    try {
      const systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (systemStream.getAudioTracks().length > 0) {
        captureStreams.push(systemStream);
      } else {
        systemStream.getTracks().forEach(track => track.stop());
        systemCaptureError = '未获取到电脑声音，请在系统共享窗口中开启“共享系统音频”';
      }
    } catch (error) {
      systemCaptureError = error && error.message ? error.message : String(error);
    }
    if (audioMode === 'formal' && captureStreams.length === 0) {
      throw new Error(systemCaptureError + '；macOS 15 以下版本不支持当前系统音频采集方式');
    }
    if (audioMode === 'demo') {
      startupStage = 'capture-microphone';
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      captureStreams.push(microphoneStream);
      if (systemCaptureError) {
        pendingResults.push({ text: '', isFinal: false, error: '未能采集系统音频，演示模式已自动改用麦克风：' + systemCaptureError });
      }
    }

    startupStage = 'prepare-audio';
    // 2. 创建 AudioContext (浏览器实际采样率可能是48k，我们做重采样)
    audioContext = new AudioContext();
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
    // 4096 samples buffer
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    // 3. 连接 WebSocket（使用注入的配置）
    const asrWsUrl = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.wsUrl) || 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async';
    const asrModel = (window.__ASR_CONFIG__ && window.__ASR_CONFIG__.model) || 'bigmodel';
    startupStage = 'connect-asr';
    ws = new WebSocket(asrWsUrl);
    const initialWs = ws;
    initialWs.binaryType = 'arraybuffer';

    initialWs.onopen = async () => {
      if (ws !== initialWs || !keepSession) return;
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
      if (ws !== initialWs) return;
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
      if (ws !== initialWs) return;
      console.error('[ASR] WebSocket error:', e);
      startupError = '语音识别服务连接失败，请检查网络和后台模型配置';
      pendingResults.push({ text: '', isFinal: false, error: startupError });
    };

    initialWs.onclose = (e) => {
      if (ws !== initialWs) return;
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
    pendingResults.push({ text: '', isFinal: false, error: startupError });
  }
}

async function stopListening(graceful = true) {
  keepSession = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isListening = false;

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
  };
}
</script>
</body></html>`;
