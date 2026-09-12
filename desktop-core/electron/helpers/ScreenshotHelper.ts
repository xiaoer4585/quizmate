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
import { composeVerticalBitmap } from '../../shared/screenshot-composite'
import {
  getMacScreenPermission,
  requestScreenCaptureAccess,
  type MacScreenPermission,
} from './MacCapturePermissions'

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
  code?: string
  stage?: string
}

export interface CompressedScreenshotResult {
  dataUrl: string
  originalBytes: number
  outputBytes: number
  originalWidth: number
  originalHeight: number
  outputWidth: number
  outputHeight: number
  quality: number | null
  compressionMs: number
  waitMs: number
  cacheHit: boolean
}

interface CachedCompression {
  fingerprint: string
  promise: Promise<Omit<CompressedScreenshotResult, 'waitMs' | 'cacheHit'>>
}

export class ScreenshotHelper {
  private configHelper: ConfigHelper
  private screenshotsDir: string = ''
  private extraScreenshotsDir: string = ''
  private tempDir: string = ''
  private lastScreenshotTime: number = 0
  private processing: LightweightProcessingHelper | null = null
  private captureInFlight = false
  private compressionCache = new Map<string, CachedCompression>()

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
    if (this.captureInFlight) {
      return { success: false, error: '截图正在处理中，请稍候', code: 'CAPTURE_IN_FLIGHT', stage: 'capture' }
    }
    if (!this.canCaptureNow()) {
      return { success: false, error: '截图过于频繁，请稍后再试' }
    }
    this.captureInFlight = true
    try {
      const result = await this.captureFullScreenInternal()
      // 失败的截图必须立即可重试: 权限错误不应占用限流窗口,
      // 否则下一次快捷键会被误报为"截图过于频繁"
      if (result.success) this.lastScreenshotTime = Date.now()
      return result
    } finally {
      this.captureInFlight = false
    }
  }

  private async captureFullScreenInternal(): Promise<ScreenshotResult> {
    const fileName = `${uuidv4()}.png`
    const tempPath = path.join(this.tempDir, fileName)

    // macOS: 先探测并按需请求屏幕录制权限，覆盖 not-determined 状态。
    const permissionError = await this.ensureScreenCapturePermission()
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
          const imageError = this.validateImage(png, thumbnailSize)
          if (!imageError) {
            fs.writeFileSync(tempPath, png)
            return { success: true, filePath: tempPath }
          }
          console.warn('[ScreenshotHelper] macOS desktopCapturer returned invalid image:', imageError)
        }
        const permissionAfterCapture = await this.ensureScreenCapturePermission(false)
        if (permissionAfterCapture) return { success: false, error: permissionAfterCapture }
      } catch (e) {
        console.warn('[ScreenshotHelper] Electron screen capture failed, trying screenshot-desktop:', e)
        const permissionAfterCapture = await this.ensureScreenCapturePermission(false)
        if (permissionAfterCapture) return { success: false, error: permissionAfterCapture }
      }
    }

    // macOS 只使用系统 screencapture 作为明确回退，避免多套采集器争抢 TCC 状态。
    if (IS_MAC) {
      try {
        await this.runScreencapture(['-x', tempPath])
        if (fs.existsSync(tempPath)) {
          const png = fs.readFileSync(tempPath)
          const imageError = this.validateImage(png)
          if (!imageError) return { success: true, filePath: tempPath }
          console.warn('[ScreenshotHelper] macOS screencapture returned invalid image:', imageError)
        }
      } catch (e) {
        console.error('[ScreenshotHelper] macOS screencapture fallback failed:', e)
      }
      return {
        success: false,
        error: '截图失败。请在“系统设置 > 隐私与安全性 > 屏幕录制”中允许 QuizMate，然后彻底退出并重新打开应用',
        code: 'SCREEN_CAPTURE_FAILED',
        stage: 'capture',
      }
    }

    // Windows 主路径: screenshot-desktop
    try {
      const screenshot = await import('screenshot-desktop')
      await screenshot.default({ filename: tempPath, format: 'png' })
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0 && !this.validateImage(fs.readFileSync(tempPath))) {
        return { success: true, filePath: tempPath }
      }
    } catch (e) {
      console.warn('[ScreenshotHelper] screenshot-desktop failed, trying platform fallback:', e)
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
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0 && !this.validateImage(fs.readFileSync(tempPath))) {
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
      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0
        && !this.validateImage(fs.readFileSync(tempPath))) {
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

  public async getCombinedCompressedScreenshot(filePaths: string[]): Promise<CompressedScreenshotResult> {
    const queue = filePaths.filter(Boolean)
    if (queue.length === 0) {
      throw new Error('没有可分析的截图')
    }
    if (queue.length === 1) {
      return this.getCompressedScreenshot(queue[0])
    }

    const bitmaps = queue.map((filePath) => {
      const buffer = fs.readFileSync(filePath)
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) throw new Error(`截图无效：${path.basename(filePath)}`)
      const size = image.getSize()
      return { buffer: image.toBitmap(), width: size.width, height: size.height }
    })
    const composite = composeVerticalBitmap(bitmaps)
    if (!composite) throw new Error('截图合成失败')

    const compositeImage = nativeImage.createFromBitmap(composite.buffer, { width: composite.width, height: composite.height })
    if (compositeImage.isEmpty()) throw new Error('截图合成失败')

    const tempPath = path.join(this.tempDir, `bundle-${uuidv4()}.png`)
    fs.writeFileSync(tempPath, compositeImage.toPNG())
    try {
      return await this.getCompressedScreenshot(tempPath)
    } finally {
      try { fs.unlinkSync(tempPath) } catch {}
    }
  }

  public deleteLatest(isExtra: boolean = false): boolean {
    const files = this.getQueue(isExtra)
    if (files.length === 0) return false
    const latest = files[files.length - 1]
    try {
      fs.unlinkSync(latest)
      this.compressionCache.delete(latest)
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
        const filePath = path.join(dir, f)
        try { fs.unlinkSync(filePath) } catch {}
        this.compressionCache.delete(filePath)
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
    this.compressionCache.clear()
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
  /** Start CPU-heavy image preparation as soon as capture finishes. */
  public prewarmCompressedBase64(filePath: string): void {
    setImmediate(() => {
      void this.getCompressedScreenshot(filePath).catch(() => {})
    })
  }

  public async fileToCompressedBase64(filePath: string): Promise<string> {
    return (await this.getCompressedScreenshot(filePath)).dataUrl
  }

  public async getCompressedScreenshot(filePath: string): Promise<CompressedScreenshotResult> {
    const waitStartedAt = Date.now()
    let fingerprint = ''
    try {
      const stat = fs.statSync(filePath)
      fingerprint = `${stat.size}:${stat.mtimeMs}`
    } catch {
      fingerprint = 'missing'
    }

    const cached = this.compressionCache.get(filePath)
    const cacheHit = !!cached && cached.fingerprint === fingerprint
    const entry = cacheHit ? cached : {
      fingerprint,
      promise: this.compressScreenshot(filePath),
    }
    if (!cacheHit) this.compressionCache.set(filePath, entry)
    const result = await entry.promise
    return { ...result, cacheHit, waitMs: Date.now() - waitStartedAt }
  }

  private async compressScreenshot(filePath: string): Promise<Omit<CompressedScreenshotResult, 'waitMs' | 'cacheHit'>> {
    const startedAt = Date.now()
    try {
      const originalBuf = fs.readFileSync(filePath)
      const originalError = this.validateImage(originalBuf)
      if (originalError) throw new Error(`截图无效：${originalError}`)
      const originalSizeKB = Math.round(originalBuf.length / 1024)
      const size = nativeImage.createFromBuffer(originalBuf).getSize()

      let bestBuf: Buffer | null = null
      let bestInfo = ''
      let bestWidth = size.width
      let bestHeight = size.height
      let bestQuality: number | null = null

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
            bestWidth = resized.width
            bestHeight = resized.height
            bestQuality = q
          }
          if (jpeg.length <= COMPRESS_TARGET_BYTES) {
            bestBuf = jpeg
            bestInfo = info
            bestWidth = resized.width
            bestHeight = resized.height
            bestQuality = q
            break outer
          }
        }
      }

      if (!bestBuf) {
        bestBuf = nativeImage.createFromBuffer(originalBuf).toJPEG(30)
        bestInfo = 'fallback q30'
        bestQuality = 30
      }

      if (bestBuf.length < 4 || bestBuf[0] !== 0xff || bestBuf[1] !== 0xd8 || bestBuf[2] !== 0xff) {
        throw new Error('JPEG 压缩结果为空或格式无效')
      }

      const compressedSizeKB = Math.round(bestBuf.length / 1024)
      console.log(`[ScreenshotHelper] Compressed: ${originalSizeKB}KB -> ${compressedSizeKB}KB (${bestInfo})`)
      return {
        dataUrl: `data:image/jpeg;base64,${bestBuf.toString('base64')}`,
        originalBytes: originalBuf.length,
        outputBytes: bestBuf.length,
        originalWidth: size.width,
        originalHeight: size.height,
        outputWidth: bestWidth,
        outputHeight: bestHeight,
        quality: bestQuality,
        compressionMs: Date.now() - startedAt,
      }
    } catch (e) {
      console.error('[ScreenshotHelper] Compression failed, falling back to raw base64:', e)
      const dataUrl = await this.fileToBase64(filePath)
      let originalBytes = 0
      try { originalBytes = fs.statSync(filePath).size } catch {}
      return {
        dataUrl,
        originalBytes,
        outputBytes: originalBytes,
        originalWidth: 0,
        originalHeight: 0,
        outputWidth: 0,
        outputHeight: 0,
        quality: null,
        compressionMs: Date.now() - startedAt,
      }
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
          this.compressionCache.delete(oldest.path)
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
      execFile('/usr/sbin/screencapture', args, { timeout: 15000 }, (err, _stdout, stderr) => {
        if (err) {
          console.warn('[ScreenshotHelper] screencapture exited with error:', { message: err.message, stderr })
          reject(err)
        }
        else resolve()
      })
    })
  }

  private validateImage(buffer: Buffer, expectedSize?: { width: number; height: number }): string | null {
    if (buffer.length < 32 || buffer.readUInt32BE(0) !== 0x89504e47) return 'PNG 数据为空或格式无效'
    try {
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) return '图像为空'
      const size = image.getSize()
      if (size.width < 2 || size.height < 2) return `图像尺寸无效 ${size.width}x${size.height}`
      if (expectedSize) {
        // Retina displays may report a one-pixel rounding difference. Reject
        // only clearly unrelated thumbnails, which otherwise look like a
        // successful capture to the caller.
        const widthRatio = size.width / Math.max(1, expectedSize.width)
        const heightRatio = size.height / Math.max(1, expectedSize.height)
        if (widthRatio < 0.25 || heightRatio < 0.25) return '图像尺寸与屏幕不匹配'
      }
      const bitmap = image.toBitmap()
      let visiblePixel = false
      for (let i = 0; i < bitmap.length; i += 16) {
        if (bitmap[i] !== 0 || bitmap[i + 1] !== 0 || bitmap[i + 2] !== 0) {
          visiblePixel = true
          break
        }
      }
      return visiblePixel ? null : '采集结果为全黑或全透明图像'
    } catch (error) {
      return `图像解析失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  private async ensureScreenCapturePermission(requestIfNeeded = true): Promise<string | null> {
    if (!IS_MAC) return null
    const mediaStatus = systemPreferences.getMediaAccessStatus('screen') as MacScreenPermission
    const status = getMacScreenPermission(mediaStatus)
    console.info('[ScreenshotHelper] screen permission status:', status)
    if (status === 'granted') return null
    if (!requestIfNeeded || status === 'denied' || status === 'restricted') {
      return '请在“系统设置 > 隐私与安全性 > 屏幕录制”中允许 QuizMate，然后彻底退出并重新打开应用'
    }
    try {
      // desktopCapturer probe registers the app in the Screen & System Audio Recording category.
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    } catch (error) {
      console.warn('[ScreenshotHelper] screen permission probe failed:', error)
    }
    requestScreenCaptureAccess()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const actual = getMacScreenPermission(systemPreferences.getMediaAccessStatus('screen') as MacScreenPermission)
    if (actual === 'granted') return null
    return '请在“系统设置 > 隐私与安全性 > 屏幕录制”中允许 QuizMate，然后彻底退出并重新打开应用'
  }
}
