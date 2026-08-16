// 面试助手 - 离线语音识别模块
// 使用 Windows SAPI (System.Speech) 进行中文语音识别
// 零外部依赖，不需要下载模型，不需要网络
// 通过 PowerShell 调用 .NET System.Speech 命名空间
//
// 注意：需要系统已安装中文语音识别语言包
// Windows 10/11 通常自带中文识别支持
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export class SapiVoiceHelper {
  private psProcess: ChildProcess | null = null;
  private listening = false;
  private onTextCallback: ((text: string, isFinal: boolean) => void) | null = null;

  init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * 启动语音识别
   * 使用 PowerShell + System.Speech 进行连续中文识别
   */
  async start(onText: (text: string, isFinal: boolean) => void): Promise<void> {
    if (this.listening) return;
    this.onTextCallback = onText;
    this.listening = true;

    // PowerShell 脚本：使用 System.Speech 进行连续语音识别
    // 使用 DictationGrammar 自由听写模式
    const psScript = `
$ErrorActionPreference = "Stop"
try {
    Add-Type -AssemblyName System.Speech
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $recognizer.SetInputToDefaultAudio()

    # 自由听写语法
    $dictation = New-Object System.Speech.Recognition.DictateGrammar
    $recognizer.LoadGrammar($dictation)

    # 设置超时：说话停顿2秒后自动结束当前识别
    $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(10)
    $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(10)
    $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(800)

    # 识别完成事件
    $recognizer.RecognizeCompleted += {
        param($sender, $e)
        if ($e.Result -and $e.Result.Text) {
            Write-Output ("TEXT:" + $e.Result.Text)
            [Console]::Out.Flush()
        }
        if (-not $e.Cancelled -and -not $e.Error) {
            try {
                $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
            } catch {}
        }
    }

    # 识别中事件（部分结果）
    $recognizer.SpeechRecognized += {
        param($sender, $e)
        if ($e.Result -and $e.Result.Text -and $e.Result.Confidence -gt 0.3) {
            Write-Output ("TEXT:" + $e.Result.Text)
            [Console]::Out.Flush()
        }
    }

    # 开始识别（Single 模式，每次识别完成后自动重启）
    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)

    # 保持脚本运行
    while ($true) {
        Start-Sleep -Milliseconds 200
    }
} catch {
    Write-Output ("ERROR:" + $_.Exception.Message)
    [Console]::Out.Flush()
}
`;

    this.psProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let lineBuffer = '';

    this.psProcess.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // 保留最后不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TEXT:')) {
          const text = trimmed.substring(5).trim();
          if (text && text.length >= 2) {
            this.onTextCallback?.(text, true);
          }
        } else if (trimmed.startsWith('ERROR:')) {
          console.error('[SapiVoice] SAPI Error:', trimmed.substring(6));
        }
      }
    });

    // 也处理 lineBuffer 中剩余的内容
    this.psProcess.stdout?.on('end', () => {
      if (lineBuffer.trim().startsWith('TEXT:')) {
        const text = lineBuffer.trim().substring(5).trim();
        if (text && text.length >= 2) {
          this.onTextCallback?.(text, true);
        }
      }
    });

    this.psProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[SapiVoice] stderr:', data.toString());
    });

    this.psProcess.on('error', (err) => {
      console.error('[SapiVoice] Process error:', err);
      this.listening = false;
    });

    this.psProcess.on('exit', (code) => {
      console.log('[SapiVoice] Process exited with code:', code);
      this.listening = false;
    });

    console.log('[SapiVoice] Speech recognition started (Windows SAPI)');
  }

  /**
   * 停止语音识别
   */
  stop(): void {
    this.listening = false;
    if (this.psProcess) {
      try {
        // 发送 Ctrl+C 信号终止 PowerShell
        this.psProcess.kill();
      } catch {}
      this.psProcess = null;
    }
    this.onTextCallback = null;
    console.log('[SapiVoice] Speech recognition stopped');
  }

  isListening(): boolean {
    return this.listening;
  }

  destroy(): void {
    this.stop();
  }
}
