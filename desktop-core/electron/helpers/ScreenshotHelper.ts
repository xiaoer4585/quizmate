// Screenshot helper - 跨平台截图
// 主路径: screenshot-desktop
// Windows 回退: PowerShell + System.Drawing (CopyFromScreen)
// macOS   回退: Electron desktopCapturer(触发系统录屏授权) -> /usr/sbin/screencapture
// macOS   额外: 启动前检测屏幕录制权限, 拒绝时给出中文引导
import { app, desktopCapturer, nativeImage, screen, systemPreferences } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { exec, execFile } from 'child_process'
import { ConfigHelper } from '../ConfigHelper'
import { LightweightProcessingHelper } from './ProcessingHelper'

const IS_MAC = process.platform === 'darwin'

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
    const result = await this.captureFullScreenInternal()
    // 失败的截图必须立即可重试: 权限错误不应占用限流窗口,
    // 否则下一次快捷键会被误报为"截图过于频繁"
    if (result.success) this.lastScreenshotTime = Date.now()
    return result
  }

  private async captureFullScreenInternal(): Promise<ScreenshotResult> {
    const fileName = `${uuidv4()}.png`
    const tempPath = path.join(this.tempDir, fileName)

    // macOS: 先检测屏幕录制权限
    const permissionError = this.getScreenPermissionError()
    if (permissionError) return { success: false, error: permissionError }

    if (IS_MAC) {
      // macOS 主路径: Electron 原生采集(未授权时会触发系统录屏授权弹窗), 并按 Retina scaleFactor 取全分辨率
      try {
        const display = screen.getPrimaryDisplay()
        const thumbnailSize = {
          width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
          height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
        }
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
        const source = sources.find((item) => item.display_id === String(display.id)) || sources[0]
        if (source && !source.thumbnail.isEmpty()) {
          const png = source.thumbnail.toPNG()
          if (png.length > 0) {
            fs.writeFileSync(tempPath, png)
            return { success: true, filePath: tempPath }
          }
        }
        const permissionAfterCapture = this.getScreenPermissionError()
        if (permissionAfterCapture) return { success: false, error: permissionAfterCapture }
      } catch (e) {
        console.warn('[ScreenshotHelper] Electron screen capture failed, trying screenshot-desktop:', e)
        const permissionAfterCapture = this.getScreenPermissionError()
        if (permissionAfterCapture) return { success: false, error: permissionAfterCapture }
      }
    }

    // 跨平台主路径: screenshot-desktop
    try {
      const screenshot = await import('screenshot-desktop')
      await screenshot.default({ filename: tempPath, format: 'png' })
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.warn('[ScreenshotHelper] screenshot-desktop failed, trying platform fallback:', e)
    }

    if (IS_MAC) {
      // macOS 系统兜底: screencapture
      try {
        await this.runScreencapture(['-x', tempPath])
        if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          return { success: true, filePath: tempPath }
        }
      } catch (e) {
        console.error('[ScreenshotHelper] macOS screencapture fallback failed:', e)
      }
      return {
        success: false,
        error: '截图失败。请在"系统设置 > 隐私与安全性 > 屏幕录制"中允许 QuizMate，然后彻底退出并重新打开应用',
      }
    }

    // Windows 兜底: PowerShell + System.Drawing
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
    const fileName = `${uuidv4()}.png`
    const tempPath = path.join(this.tempDir, fileName)
    try {
      if (IS_MAC) {
        const region = `${Math.floor(x)},${Math.floor(y)},${Math.max(1, Math.floor(width))},${Math.max(1, Math.floor(height))}`
        await this.runScreencapture(['-x', `-R${region}`, tempPath])
      } else {
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
      }
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        this.lastScreenshotTime = Date.now()
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.error('[ScreenshotHelper] Region capture failed:', e)
    }
    // Fallback to full screen
    // 本次捕获已通过限流检查, 回退时不再二次限流(否则永远报"过于频繁")
    const fallback = await this.captureFullScreenInternal()
    if (fallback.success) this.lastScreenshotTime = Date.now()
    return fallback
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

  private runScreencapture(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('/usr/sbin/screencapture', args, { timeout: 15000 }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private getScreenPermissionError(): string | null {
    if (!IS_MAC) return null
    const permission = systemPreferences.getMediaAccessStatus('screen')
    if (permission !== 'denied' && permission !== 'restricted') return null
    return '请在"系统设置 > 隐私与安全性 > 屏幕录制"中允许 QuizMate，然后彻底退出并重新打开应用'
  }
}
