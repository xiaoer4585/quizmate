// Screenshot helper - uses screenshot-desktop with PowerShell fallback
import { app, nativeImage } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import { ConfigHelper } from '../ConfigHelper'
import { LightweightProcessingHelper } from './ProcessingHelper'

// 压缩参数: 解决 413 Payload Too Large
// 历史入口的请求体限制约 1MB，全屏 PNG base64 后可达 3-7MB。
// 目标: 压缩后二进制 < 380KB, base64 后 < 510KB, JSON 整体 < 550KB (安全在 1MB 内)
const COMPRESS_TARGET_BYTES = 380 * 1024
// 逐步压缩的尺寸/质量组合 (从高到低尝试, 找到第一个达标的结果)
const COMPRESS_EDGES = [1600, 1280, 960, 720]       // 长边像素
const COMPRESS_QUALITIES = [78, 70, 60, 45, 30]      // 优先保留文字清晰度

export interface ScreenshotResult {
  success: boolean
  filePath?: string
  base64?: string
  error?: string
}

export class ScreenshotHelper {
  private configHelper: ConfigHelper
  private screenshotsDir: string = ''
  private extraScreenshotsDir: string = ''
  private tempDir: string = ''
  private lastScreenshotTime: number = 0
  private processing: LightweightProcessingHelper | null = null

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  /** 注入处理助手，用于截图后触发分析 */
  public setProcessing(p: LightweightProcessingHelper): void {
    this.processing = p
  }

  public init(): void {
    const userData = app.getPath('userData')
    this.screenshotsDir = path.join(userData, 'screenshots')
    this.extraScreenshotsDir = path.join(userData, 'extra_screenshots')
    this.tempDir = path.join(userData, 'temp', 'QuizMate-screenshots')
    for (const dir of [this.screenshotsDir, this.extraScreenshotsDir, this.tempDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  public canCaptureNow(): boolean {
    const now = Date.now()
    const minInterval = this.configHelper.getAppConfig().minScreenshotIntervalMs
    return now - this.lastScreenshotTime >= minInterval
  }

  public async captureFullScreen(): Promise<ScreenshotResult> {
    if (!this.canCaptureNow()) {
      return { success: false, error: '截图过于频繁，请稍后再试' }
    }
    this.lastScreenshotTime = Date.now()
    const fileName = `${uuidv4()}.png`
    const tempPath = path.join(this.tempDir, fileName)
    // Primary: screenshot-desktop
    try {
      const screenshot = await import('screenshot-desktop')
      await screenshot.default({ filename: tempPath, format: 'png' })
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.warn('[ScreenshotHelper] screenshot-desktop failed, trying PowerShell:', e)
    }
    // Fallback: PowerShell + System.Drawing
    try {
      const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${tempPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`
      await this.runPowerShell(psScript)
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.error('[ScreenshotHelper] PowerShell fallback failed:', e)
    }
    return { success: false, error: '截图失败，请稍后重试' }
  }

  public async captureRegion(x: number, y: number, width: number, height: number): Promise<ScreenshotResult> {
    if (!this.canCaptureNow()) {
      return { success: false, error: '截图过于频繁' }
    }
    this.lastScreenshotTime = Date.now()
    const fileName = `${uuidv4()}.png`
    const tempPath = path.join(this.tempDir, fileName)
    try {
      const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bmp = New-Object System.Drawing.Bitmap(${Math.max(1, Math.floor(width))}, ${Math.max(1, Math.floor(height))})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(${Math.floor(x)}, ${Math.floor(y)}, 0, 0, $bmp.Size)
$bmp.Save('${tempPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`
      await this.runPowerShell(psScript)
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.error('[ScreenshotHelper] Region capture failed:', e)
    }
    // Fallback to full screen
    return this.captureFullScreen()
  }

  public async saveToQueue(filePath: string, isExtra: boolean = false): Promise<string> {
    const targetDir = isExtra ? this.extraScreenshotsDir : this.screenshotsDir
    const ext = path.extname(filePath) || '.png'
    const newName = `${uuidv4()}${ext}`
    const targetPath = path.join(targetDir, newName)
    try {
      fs.copyFileSync(filePath, targetPath)
      // Enforce max items
      this.trimQueue(targetDir)
      return targetPath
    } catch (e) {
      console.error('[ScreenshotHelper] Failed to save to queue:', e)
      return ''
    }
  }

  public getQueue(isExtra: boolean = false): string[] {
    const dir = isExtra ? this.extraScreenshotsDir : this.screenshotsDir
    if (!fs.existsSync(dir)) return []
    try {
      const files = fs.readdirSync(dir)
        .filter(f => /\.(png|jpg|jpeg|bmp)$/i.test(f))
        .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime)
      return files.map(f => f.path)
    } catch {
      return []
    }
  }

  public deleteLatest(isExtra: boolean = false): boolean {
    const files = this.getQueue(isExtra)
    if (files.length === 0) return false
    const latest = files[files.length - 1]
    try {
      fs.unlinkSync(latest)
      return true
    } catch {
      return false
    }
  }

  public clearQueue(isExtra: boolean = false): void {
    const dir = isExtra ? this.extraScreenshotsDir : this.screenshotsDir
    if (!fs.existsSync(dir)) return
    try {
      const files = fs.readdirSync(dir)
      for (const f of files) {
        try { fs.unlinkSync(path.join(dir, f)) } catch {}
      }
    } catch {}
  }

  public clearAll(): void {
    this.clearQueue(false)
    this.clearQueue(true)
    // Also clear temp
    if (fs.existsSync(this.tempDir)) {
      try {
        const files = fs.readdirSync(this.tempDir)
        for (const f of files) {
          try { fs.unlinkSync(path.join(this.tempDir, f)) } catch {}
        }
      } catch {}
    }
  }

  public async fileToBase64(filePath: string): Promise<string> {
    try {
      const buf = fs.readFileSync(filePath)
      const mime = this.detectMime(filePath)
      const b64 = buf.toString('base64')
      return `data:${mime};base64,${b64}`
    } catch (e) {
      console.error('[ScreenshotHelper] Failed to convert to base64:', e)
      return ''
    }
  }

  /**
   * 将截图压缩为 JPEG base64, 用于发送给 AI 分析接口.
   * 解决 HTTP 413 Payload Too Large: 全屏 PNG base64 后可达 3-7MB, 超过服务端限制.
   *
   * 动态压缩策略: 依次尝试 [1600/1280/960/720 像素] x [80/60/45/30 质量] 组合,
   * 找到第一个 <= 380KB 的结果. 保证 base64 后 < 510KB, JSON 整体 < 550KB,
   * 也兼容旧版 1MB 入口，同时尽可能保留文字清晰度。
   */
  public async fileToCompressedBase64(filePath: string): Promise<string> {
    try {
      const originalBuf = fs.readFileSync(filePath)
      const originalSizeKB = Math.round(originalBuf.length / 1024)
      const size = nativeImage.createFromBuffer(originalBuf).getSize()

      let bestBuf: Buffer | null = null
      let bestInfo = ''

      // 从高到低尝试, 找到第一个达标的; 若都不达标则保留最小的一个
      outer:
      for (const edge of COMPRESS_EDGES) {
        // 每次重新 createFromBuffer, 因为 resize 是 in-place 的
        let img = nativeImage.createFromBuffer(originalBuf)
        const maxDim = Math.max(size.width, size.height)
        if (maxDim > edge) {
          const scale = edge / maxDim
          img = img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) })
        }
        const resized = img.getSize()
        for (const q of COMPRESS_QUALITIES) {
          const jpeg = img.toJPEG(q)
          const info = `${size.width}x${size.height} -> ${resized.width}x${resized.height} q${q} = ${Math.round(jpeg.length / 1024)}KB`
          if (!bestBuf || jpeg.length < bestBuf.length) {
            bestBuf = jpeg
            bestInfo = info
          }
          if (jpeg.length <= COMPRESS_TARGET_BYTES) {
            bestBuf = jpeg
            bestInfo = info
            break outer
          }
        }
      }

      if (!bestBuf) {
        bestBuf = nativeImage.createFromBuffer(originalBuf).toJPEG(30)
        bestInfo = 'fallback q30'
      }

      const compressedSizeKB = Math.round(bestBuf.length / 1024)
      console.log(`[ScreenshotHelper] Compressed: ${originalSizeKB}KB -> ${compressedSizeKB}KB (${bestInfo})`)
      return `data:image/jpeg;base64,${bestBuf.toString('base64')}`
    } catch (e) {
      console.error('[ScreenshotHelper] Compression failed, falling back to raw base64:', e)
      return this.fileToBase64(filePath)
    }
  }

  private detectMime(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    switch (ext) {
      case '.png': return 'image/png'
      case '.jpg':
      case '.jpeg': return 'image/jpeg'
      case '.bmp': return 'image/bmp'
      case '.gif': return 'image/gif'
      default: return 'image/png'
    }
  }

  private trimQueue(dir: string): void {
    const maxItems = this.configHelper.getAppConfig().maxScreenshots
    try {
      const files = fs.readdirSync(dir)
        .filter(f => /\.(png|jpg|jpeg|bmp)$/i.test(f))
        .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime)
      while (files.length > maxItems) {
        const oldest = files.shift()
        if (oldest) {
          try { fs.unlinkSync(oldest.path) } catch {}
        }
      }
    } catch {}
  }

  private runPowerShell(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmpPs = path.join(this.tempDir, `capture-${Date.now()}.ps1`)
      try {
        fs.writeFileSync(tmpPs, script, 'utf8')
      } catch (e) {
        reject(e)
        return
      }
      const cmd = `powershell -ExecutionPolicy Bypass -NoProfile -File "${tmpPs}"`
      exec(cmd, { timeout: 15000, windowsHide: true }, (err) => {
        try { fs.unlinkSync(tmpPs) } catch {}
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
