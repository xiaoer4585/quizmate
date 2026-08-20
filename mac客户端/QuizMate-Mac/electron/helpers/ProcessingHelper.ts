// Processing helper - calls the unified `analyze` action on study-auth-api.
// Mirrors the original desktop-client: one-shot request, credits deducted server-side.
// No SSE streaming - the server returns the full result in a single response.
import { BrowserWindow } from 'electron'
import crypto from 'crypto'
import { ConfigHelper } from '../ConfigHelper'
import { ProcessingMode } from '../../shared/shortcuts'
import { postAction, postActionEnvelope, ApiError } from '../apiClient'

export interface AnalyzeOptions {
  images: string[] // base64 data URLs
  mode: ProcessingMode
}

export interface AnalyzeResult {
  success: boolean
  answer?: string
  explanation?: string
  code?: string
  creditBalance?: number
  creditCost?: number
  usedKnowledge?: boolean
  knowledgeHits?: Array<{ docId: string; fileName: string }>
  raw?: Record<string, unknown>
  error?: string
}

export interface CreditStatus {
  available: number
  sufficient: boolean
  costPerSuccess: number
}

function decodeImageData(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is.exec(dataUrl.trim())
  const contentType = match?.[1]?.toLowerCase() || 'image/jpeg'
  const base64 = (match?.[2] || dataUrl).replace(/\s+/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new ApiError('截图数据为空，请重新截图。', 'INVALID_SCREENSHOT', 400, 'response')
  return { buffer, contentType }
}

interface ScreenshotUploadTicket {
  objectKey: string
  uploadUrl: string
  screenshotUrl: string
  uploadTicket?: string
  method: 'PUT'
  headers?: Record<string, string>
  expiresAt?: string
}

/** Parse the structured `data` field returned by the analyze action. */
function parseStructuredAnswer(value: unknown): { answer: string; explanation: string; code: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { answer: '', explanation: '', code: '' }
  }
  const record = value as Record<string, unknown>
  const items = Array.isArray(record.items) ? record.items.filter((i) => i && typeof i === 'object') : []
  if (!items.length) {
    const note = typeof record.note === 'string' ? record.note.trim() : ''
    return { answer: '', explanation: note, code: '' }
  }
  const answers = items.map((item, index) => {
    const obj = item as Record<string, unknown>
    const prefix = typeof obj.questionNo === 'string' && obj.questionNo.trim()
      ? `${obj.questionNo.trim()}. `
      : items.length > 1 ? `${index + 1}. ` : ''
    return `${prefix}${typeof obj.answer === 'string' ? obj.answer.trim() : ''}`.trim()
  }).filter(Boolean)
  const explanations = items.map((item, index) => {
    const obj = item as Record<string, unknown>
    const text = typeof obj.explanation === 'string' ? obj.explanation.trim() : ''
    if (!text) return ''
    return items.length > 1 ? `${index + 1}. ${text}` : text
  }).filter(Boolean)
  const codes = items.map((item) => {
    const code = typeof (item as Record<string, unknown>).code === 'string'
      ? String((item as Record<string, unknown>).code).trim()
      : ''
    const language = typeof (item as Record<string, unknown>).language === 'string'
      ? String((item as Record<string, unknown>).language).trim()
      : ''
    if (!code) return ''
    return language ? `${language}\n${code}` : code
  }).filter(Boolean)
  const note = typeof record.note === 'string' ? record.note.trim() : ''
  return {
    answer: answers.join('\n'),
    explanation: [...explanations, note].filter(Boolean).join('\n\n'),
    code: codes.join('\n\n')
  }
}

function firstText(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = firstText(value as Record<string, unknown>, ['answer', 'content', 'text', 'explanation'])
      if (nested) return nested
    }
  }
  return ''
}

function finiteNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(num) ? num : undefined
}

export class LightweightProcessingHelper {
  private configHelper: ConfigHelper
  private mainWindow: BrowserWindow | null = null
  private currentController: AbortController | null = null

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  /** Query the current credit balance via getAccountProfile. */
  public async checkCredits(): Promise<CreditStatus> {
    const token = this.configHelper.getAuthToken()
    const costPerSuccess = this.configHelper.getAppConfig().creditCostPerSuccess ?? 10
    if (!token) return { available: 0, sufficient: false, costPerSuccess }
    try {
      const data = await postAction<{ account: { credits: number }; costPerSuccess?: number }>(
        this.configHelper.getAppConfig().apiBaseUrl,
        'getAccountProfile',
        { accountToken: token },
        { timeoutMs: 15_000 }
      )
      const available = finiteNumber(data.account?.credits) ?? 0
      return {
        available,
        sufficient: available >= (finiteNumber(data.costPerSuccess) ?? costPerSuccess),
        costPerSuccess: finiteNumber(data.costPerSuccess) ?? costPerSuccess,
      }
    } catch {
      // 网络错误时不应阻止用户请求: 服务端是积分扣减的权威来源
      // 返回 sufficient: true 让请求继续, 服务端会在积分不足时返回错误
      return { available: -1, sufficient: true, costPerSuccess }
    }
  }

  /** 生成/获取邀请码与邀请链接 */
  public async generateInviteCode(): Promise<{
    success: boolean
    inviteCode?: string
    inviteLink?: string
    shareText?: string
    error?: string
  }> {
    const token = this.configHelper.getAuthToken()
    if (!token) return { success: false, error: '未登录，请先登录账号。' }
    try {
      const data = await postAction<{ inviteCode: string; inviteLink: string; shareText: string }>(
        this.configHelper.getAppConfig().apiBaseUrl,
        'generateInviteCode',
        { accountToken: token },
        { timeoutMs: 15_000 }
      )
      return { success: true, inviteCode: data.inviteCode, inviteLink: data.inviteLink, shareText: data.shareText }
    } catch (e: any) {
      return { success: false, error: e instanceof Error ? e.message : '获取邀请码失败' }
    }
  }

  /**
   * Run a one-shot analyze request. Sends `initial-start` then either
   * `solution-stream-complete` (success) or `solution-stream-error` (failure)
   * to the overlay window, preserving the legacy event names so the renderer
   * keeps working without changes.
   */
  public async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const token = this.configHelper.getAuthToken()
    if (!token) {
      this.sendEvent('processing-unauthorized', { error: '未登录，请先登录账号。' })
      return { success: false, error: '未登录', code: 'AUTH_REQUIRED' }
    }
    if (!options.images || options.images.length === 0) {
      this.sendEvent('processing-no-screenshots', { error: '请先截图后再搜题。' })
      return { success: false, error: '没有截图', code: 'NO_SCREENSHOTS' }
    }

    this.sendEvent('initial-start', { mode: options.mode, imageCount: options.images.length })

    // Use the first screenshot; upload the binary to OSS before calling analyze.
    const screenshot = decodeImageData(options.images[0])
    const deviceId = this.configHelper.getUserConfig().clientSettings?.deviceId || ''

    console.log('[ProcessingHelper] analyze:', {
      mode: options.mode,
      imageCount: options.images.length,
      imageBytes: screenshot.buffer.length,
      hasToken: !!token,
      deviceId: deviceId || '(empty)',
      apiBaseUrl: this.configHelper.getAppConfig().apiBaseUrl,
    })

    this.currentController = new AbortController()
    const requestId = `desktop-${crypto.randomUUID()}`
    const startedAt = Date.now()
    try {
      const endpoint = this.configHelper.getAppConfig().apiBaseUrl

      // 混合上传策略：压缩后小于 2MB 直接传 base64，跳过 OSS 中转（节省 1-4 秒）
      // 大于 2MB 走 OSS 上传（避免请求体过大导致 413/超时）
      const DIRECT_UPLOAD_THRESHOLD = 2 * 1024 * 1024 // 2MB
      const analyzeInput: Record<string, unknown> = {
        accountToken: token,
        deviceId,
        requestId,
        source: 'screen',
        mode: options.mode || 'overlay',
      }

      if (screenshot.buffer.length <= DIRECT_UPLOAD_THRESHOLD) {
        // 直接传 base64，跳过 OSS 上传
        console.log('[ProcessingHelper] direct base64 upload:', { bytes: screenshot.buffer.length })
        analyzeInput.screenshot = `data:${screenshot.contentType};base64,${screenshot.buffer.toString('base64')}`
      } else {
        // 图片较大，走 OSS 上传
        console.log('[ProcessingHelper] OSS upload (image too large):', { bytes: screenshot.buffer.length })
        const upload = await postAction<ScreenshotUploadTicket>(
          endpoint,
          'createScreenshotUpload',
          {
            accountToken: token,
            deviceId,
            contentType: screenshot.contentType,
            sizeBytes: screenshot.buffer.length,
          },
          { timeoutMs: 30_000, signal: this.currentController.signal }
        )
        const uploadTarget = new URL(upload.uploadUrl)
        if (uploadTarget.protocol !== 'https:' || !uploadTarget.hostname.endsWith('.aliyuncs.com')) {
          throw new ApiError('截图上传地址无效，请稍后重试。', 'INVALID_UPLOAD_URL', 502, 'response')
        }
        const uploadResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': screenshot.contentType, ...(upload.headers || {}) },
          body: new Uint8Array(screenshot.buffer),
          signal: this.currentController.signal,
        })
        if (!uploadResponse.ok) {
          throw new ApiError(`截图上传失败（${uploadResponse.status}）。`, 'SCREENSHOT_UPLOAD_FAILED', uploadResponse.status, 'response')
        }

        if (upload.uploadTicket) {
          analyzeInput.objectKey = upload.objectKey
          analyzeInput.uploadTicket = upload.uploadTicket
        } else {
          analyzeInput.screenshotUrl = upload.screenshotUrl
          analyzeInput.objectKey = upload.objectKey
        }
      }

      const { data, envelope } = await postActionEnvelope<Record<string, unknown>>(
        endpoint,
        'analyze',
        analyzeInput,
        { timeoutMs: this.configHelper.getAppConfig().httpTimeoutMs, signal: this.currentController.signal }
      )
      // data 已经是 envelope.data 的内容 (postActionEnvelope 已解包)
      const structured = parseStructuredAnswer(data)
      const answer = structured.answer || (structured.code ? '参考代码' : firstText(data, ['answer', 'result', 'content', 'text', 'raw', 'note']))
      const explanation = structured.explanation || firstText(data, ['explanation', 'analysis', 'reasoning', 'detail'])
      const code = structured.code
      if (!answer && !explanation) {
        this.sendEvent('solution-stream-error', { error: '模型没有返回有效结果。为避免误判，请刷新积分确认；当前请求不会在客户端重复扣分。' })
        return { success: false, error: '模型没有返回有效结果', code: 'EMPTY_RESULT' }
      }

      // creditBalance / creditCost / usedKnowledge / knowledgeHits 在 envelope 顶层
      const knowledgeHits = Array.isArray(envelope.knowledgeHits)
        ? (envelope.knowledgeHits as unknown[])
            .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
            .map((hit) => ({
              docId: typeof hit.docId === 'string' ? hit.docId.trim() : '',
              fileName: typeof hit.fileName === 'string' ? hit.fileName.trim() : '',
            }))
            .filter((hit) => hit.fileName)
            .slice(0, 3)
        : []

      const result: AnalyzeResult = {
        success: true,
        answer: answer || '分析完成',
        explanation,
        code,
        creditBalance: finiteNumber(envelope.creditBalance),
        creditCost: finiteNumber(envelope.creditCost) ?? this.configHelper.getAppConfig().creditCostPerSuccess,
        usedKnowledge: envelope.usedKnowledge === true,
        knowledgeHits,
        raw: data,
      }
      console.log('[ProcessingHelper] analyze timing:', { requestId, imageBytes: screenshot.buffer.length, totalMs: Date.now() - startedAt })

      // Notify overlay with the same payload shape the renderer expects.
      // voice 模式不发送悬浮框事件（由 main.ts 调用 TTS 播报）
      if (this.configHelper.getProcessingMode() !== 'voice') {
        this.sendEvent('solution-stream-complete', {
          answer: result.answer,
          explanation: result.explanation || '',
          code: result.code || '',
          thoughts: '',
          timeComplexity: '',
          spaceComplexity: '',
          mode: options.mode,
          creditBalance: result.creditBalance,
          creditCost: result.creditCost,
          usedKnowledge: result.usedKnowledge,
          knowledgeHits: result.knowledgeHits,
          rawContent: JSON.stringify(data, null, 2),
          raw: data,
        })
      }
      return result
    } catch (e: any) {
      console.error('[ProcessingHelper] analyze error:', e?.message || e, e?.code ? `(code: ${e.code})` : '')
      if (e instanceof ApiError) {
        if (e.kind === 'auth') {
          this.sendEvent('processing-unauthorized', { error: e.message })
        } else if (e.kind === 'credits') {
          this.sendEvent('out-of-credits', { error: e.message })
        } else if (e.kind === 'timeout') {
          this.sendEvent('solution-stream-error', { error: '分析超时，未扣积分。' })
        } else {
          this.sendEvent('solution-stream-error', { error: e.message })
        }
        return { success: false, error: e.message, code: e.code }
      }
      this.sendEvent('solution-stream-error', { error: e.message || String(e) })
      return { success: false, error: e.message || String(e), code: 'UNKNOWN' }
    } finally {
      this.currentController = null
    }
  }

  /** Cancel any in-flight analyze request. */
  public cancelStreaming(): void {
    if (this.currentController) {
      try { this.currentController.abort('user-cancelled') } catch {}
      this.currentController = null
    }
  }

  /** Back-compat shim: the renderer may still call createTask + startStreaming. */
  public async createTask(options: AnalyzeOptions): Promise<{ taskId: string; success: boolean; error?: string }> {
    const result = await this.analyze(options)
    return { taskId: result.success ? 'sync' : '', success: result.success, error: result.error }
  }

  public startStreaming(_taskId: string): void {
    // No-op: analyze() already returned the full result synchronously.
  }

  private sendEvent(event: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      for (const win of windows) {
        if (!win.isDestroyed()) win.webContents.send(event, data)
      }
    } else if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data)
    }
  }
}
