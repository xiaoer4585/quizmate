// TTS Helper - 完全沿用原考试插件实现
// 使用浏览器内置 Web Speech API 在客户端本地合成语音
// 不需要后端 speakAnswer，不需要 API Key，零配置，速度快
//
// 关键设计：
//   1. 使用 Chromium 内置的 SpeechSynthesis API，无需后端中转
//   2. 程序最小化时仍能播放（使用隐藏的 BrowserWindow + backgroundThrottling: false）
//   3. 支持中断当前播放（再触发截图快捷键时）
import { BrowserWindow } from 'electron'
import { ConfigHelper } from '../ConfigHelper'

export interface SpeakResult {
  success: boolean
  durationMs?: number
  charCount?: number
  error?: string
  code?: string
}

export class TtsHelper {
  private configHelper: ConfigHelper
  private audioWindow: BrowserWindow | null = null

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  public init(): void {
    // 创建一个隐藏窗口用于播放音频（程序最小化时也能播放）
    // backgroundThrottling: false 确保窗口隐藏时 SpeechSynthesis 不会被节流
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
    })
    // 加载包含 SpeechSynthesis API 的 HTML
    // 预加载语音列表，确保首次调用时 voices 已就绪
    this.audioWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>voice</title></head>
      <body>
        <script>
          // 预加载语音列表（Chromium 需要触发 voiceschanged 事件才能获取 voices）
          let cachedVoices = [];
          function loadVoices() {
            cachedVoices = speechSynthesis.getVoices() || [];
          }
          loadVoices();
          if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
            speechSynthesis.onvoiceschanged = loadVoices;
          }

          function pickChineseVoice() {
            if (!cachedVoices.length) loadVoices();
            // 优先选择中文神经网络语音（Natural/Huihui/Yaoyao）
            return cachedVoices.find(v => v.lang === 'zh-CN' && /natural|neural/i.test(v.name))
              || cachedVoices.find(v => v.lang === 'zh-CN')
              || cachedVoices.find(v => v.lang && v.lang.startsWith('zh'))
              || null;
          }

          window.electronVoice = {
            play(text, rate, volume) {
              return new Promise((resolve, reject) => {
                try {
                  // 如果正在播放，先取消
                  speechSynthesis.cancel();
                  // 稍微延迟以确保 cancel 完成
                  setTimeout(() => {
                    try {
                      const utterance = new SpeechSynthesisUtterance(text);
                      utterance.lang = 'zh-CN';
                      utterance.rate = Math.max(0.1, Math.min(10, rate || 1.0));
                      utterance.volume = Math.max(0, Math.min(1, volume || 1.0));
                      utterance.pitch = 1.0;
                      // 选择中文语音
                      const zhVoice = pickChineseVoice();
                      if (zhVoice) utterance.voice = zhVoice;
                      utterance.onend = () => resolve();
                      utterance.onerror = (e) => {
                        // 'canceled' 和 'interrupted' 是正常取消，不算错误
                        if (e.error === 'canceled' || e.error === 'interrupted') {
                          resolve();
                        } else {
                          reject(new Error(e.error || 'speech synthesis error'));
                        }
                      };
                      speechSynthesis.speak(utterance);
                    } catch (e) {
                      reject(e);
                    }
                  }, 50);
                } catch (e) {
                  reject(e);
                }
              });
            },
            stop() {
              speechSynthesis.cancel();
            },
            isPlaying() {
              return speechSynthesis.speaking;
            },
            getVoices() {
              if (!cachedVoices.length) loadVoices();
              return cachedVoices.map(v => ({ name: v.name, lang: v.lang }));
            }
          };
        </script>
      </body></html>
    `))
  }

  /** 取消进行中的 TTS 请求和播放 */
  public cancel(): void {
    this.stopPlayback()
  }

  /** 兼容旧接口：停止播放 */
  public stop(): void {
    this.stopPlayback()
  }

  /** 是否正在请求 TTS 或播放中 */
  public isBusy(): boolean {
    return this.isPlaying()
  }

  private isPlaying(): boolean {
    if (!this.audioWindow || this.audioWindow.isDestroyed()) return false
    try {
      return this.audioWindow.webContents.executeJavaScript('window.electronVoice.isPlaying()', true)
        .then((v) => Boolean(v))
        .catch(() => false) as unknown as boolean
    } catch {
      return false
    }
  }

  private stopPlayback(): void {
    if (!this.audioWindow || this.audioWindow.isDestroyed()) return
    try {
      this.audioWindow.webContents.executeJavaScript('window.electronVoice.stop()', true).catch(() => {})
    } catch {}
  }

  /**
   * 使用 Web Speech API 合成并播放语音（客户端本地合成，无需后端中转）
   * @param text 要播报的文本
   * @param signal 可选外部取消信号（当前未使用，cancel() 直接停止播放）
   */
  public async speak(text: string, signal?: AbortSignal): Promise<SpeakResult> {
    if (!text || !text.trim()) {
      return { success: false, error: '没有可播报的文本。', code: 'EMPTY_TEXT' }
    }

    const startedAt = Date.now()
    try {
      if (!this.audioWindow || this.audioWindow.isDestroyed()) {
        throw new Error('Audio window not available')
      }

      // Web Speech API 使用默认参数（语速/音量由系统控制，用户无需配置）
      await this.audioWindow.webContents.executeJavaScript(
        `window.electronVoice.play(${JSON.stringify(text)}, 1.0, 1.0)`,
        true
      )

      const durationMs = Date.now() - startedAt
      console.log('[TtsHelper] speak (Web Speech API):', { durationMs, charCount: text.length })

      return {
        success: true,
        durationMs,
        charCount: text.length,
      }
    } catch (e: any) {
      console.error('[TtsHelper] speak error:', e?.message || e)
      return { success: false, error: e.message || String(e), code: 'TTS_LOCAL_ERROR' }
    }
  }

  public destroy(): void {
    this.stopPlayback()
    if (this.audioWindow && !this.audioWindow.isDestroyed()) {
      this.audioWindow.destroy()
    }
    this.audioWindow = null
  }
}
