// 豆包 TTS Helper - 通过 QuizMate 后端调用服务，客户端不保存语音密钥
import { BrowserWindow } from 'electron';
import { AuthManager } from '../AuthManager';
import { ConfigHelper } from '../ConfigHelper';
import { postAction } from '../apiClient';

export interface ByteDanceTtsResult {
  success: boolean;
  durationMs?: number;
  error?: string;
}

export class ByteDanceTtsHelper {
  constructor(
    private configHelper: ConfigHelper,
    private authManager: AuthManager,
  ) {}

  private audioWindow: BrowserWindow | null = null;

  init(): void {
    this.audioWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });

    this.audioWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"></head>
      <body>
        <audio id="player" preload="auto"></audio>
        <script>
          let currentAudio = null;
          window.electronTts = {
            play(base64Audio) {
              return new Promise((resolve, reject) => {
                try {
                  const audio = document.getElementById('player');
                  audio.src = 'data:audio/mp3;base64,' + base64Audio;
                  audio.onended = () => resolve();
                  audio.onerror = (e) => reject(new Error('Audio playback error'));
                  audio.play().catch(e => reject(e));
                } catch(e) { reject(e); }
              });
            },
            stop() {
              try {
                const audio = document.getElementById('player');
                audio.pause();
                audio.src = '';
              } catch {}
            },
            isPlaying() {
              const audio = document.getElementById('player');
              return audio && !audio.paused && !audio.ended;
            }
          };
        </script>
      </body></html>
    `));
  }

  /** 调用字节跳动 TTS API 将文本转为语音并播放 */
  async speak(text: string): Promise<ByteDanceTtsResult> {
    if (!text || !text.trim()) {
      return { success: false, error: '没有可播报的文本' };
    }

    // 截断过长文本（API 限制）
    const truncated = text.length > 3000 ? text.substring(0, 3000) : text;
    const startedAt = Date.now();

    try {
      const token = this.configHelper.getAuthToken();
      if (!token) return { success: false, error: '请先登录后再使用语音播报' };
      const data = await postAction<{ audioBase64: string; durationMs?: number }>(
        this.configHelper.getAppConfig().apiBaseUrl,
        'speakAnswer',
        {
          text: truncated,
          format: 'mp3',
          sampleRate: 48000,
          deviceId: this.authManager.getDeviceId(),
        },
        { token, timeoutMs: 45000 },
      );
      const audioBase64 = data.audioBase64;
      if (!audioBase64) {
        return { success: false, error: 'TTS 返回格式异常' };
      }

      // 播放音频
      if (this.audioWindow && !this.audioWindow.isDestroyed()) {
        await this.audioWindow.webContents.executeJavaScript(
          `window.electronTts.play(${JSON.stringify(audioBase64)})`,
          true
        );
      }

      const durationMs = data.durationMs ?? Date.now() - startedAt;
      console.log('[ByteDanceTTS] speak success:', { durationMs, charCount: truncated.length });

      return { success: true, durationMs };
    } catch (e: any) {
      console.error('[ByteDanceTTS] speak error:', e?.message || e);
      return { success: false, error: e?.message || String(e) };
    }
  }

  cancel(): void {
    this.stopPlayback();
  }

  stop(): void {
    this.stopPlayback();
  }

  private stopPlayback(): void {
    if (!this.audioWindow || this.audioWindow.isDestroyed()) return;
    try {
      this.audioWindow.webContents.executeJavaScript('window.electronTts.stop()', true).catch(() => {});
    } catch {}
  }

  destroy(): void {
    this.stopPlayback();
    if (this.audioWindow && !this.audioWindow.isDestroyed()) {
      this.audioWindow.destroy();
    }
    this.audioWindow = null;
  }
}
