// Processing helper - calls the unified `analyze` action on study-auth-api.
// Mirrors the original desktop-client: one-shot request, credits deducted server-side.
// No SSE streaming - the server returns the full result in a single response.
import { BrowserWindow } from 'electron'
import crypto from 'crypto'
import { ConfigHelper } from '../ConfigHelper'
import { ProcessingMode } from '../../shared/shortcuts'
import type { AnalysisStage, DiagnosticErrorPayload } from '../../shared/reliability'
import { detectSupportedImageMime } from '../../shared/reliability'
import { postAction, postActionEnvelope, ApiError } from '../apiClient'
import { DiagnosticLogger } from './DiagnosticLogger'

export interface AnalyzeOptions {
  images: string[] // base64 data URLs
  mode: ProcessingMode
  operationId?: string
  requestId?: string
  attempt?: number
}

export interface AnalyzeResult {
  success: boolean
  answer?: string
  explanation?: string
  code?: string
  errorCode?: string
  stage?: string
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
  if (dataUrl.trimStart().startsWith('data:') && !match) {
    throw new ApiError('截图格式不受支持，请重新截图。', 'UNSUPPORTED_SCREENSHOT_FORMAT', 400, 'response')
  }
  const base64 = (match?.[2] || dataUrl).replace(/\s+/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new ApiError('截图数据为空，请重新截图。', 'INVALID_SCREENSHOT', 400, 'response')
  const contentType = detectSupportedImageMime(buffer)
  if (!contentType) throw new ApiError('截图数据损坏，请重新截图。', 'INVALID_SCREENSHOT', 400, 'response')
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

const diagnostics = new DiagnosticLogger()

function appendDiagnosticLog(event: string, details: Record<string, unknown>): void {
  diagnostics.append('exam-analysis', event, details)
}

function errorPayload(
  error: string,
  code: string,
  stage: AnalysisStage | string,
  context: Partial<Pick<DiagnosticErrorPayload, 'action' | 'operationId' | 'requestId' | 'attempt'>> = {},
): DiagnosticErrorPayload {
  return { error, code, stage, ...context }
}

export class LightweightProcessingHelper {
  private configHelper: ConfigHelper
  private mainWindow: BrowserWindow | null = null
  private currentController: AbortController | null = null
  private lastDiagnostic: Record<string, unknown> = {}

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
   * 邀请代理总览（含阶梯奖励进度、是否已充值、统计/提成/提现等）。
   * 用于 InviteAgent 面板与支付完成页入口。
   */
  public async getReferralOverview(): Promise<{
    success: boolean
    overview?: any
    error?: string
  }> {
    const token = this.configHelper.getAuthToken()
    if (!token) return { success: false, error: '未登录，请先登录账号。' }
    try {
      const data = await postAction<Record<string, unknown>>(
        this.configHelper.getAppConfig().apiBaseUrl,
        'getReferralOverview',
        { accountToken: token },
        { timeoutMs: 15_000 }
      )
      return { success: true, overview: data }
    } catch (e: any) {
      return { success: false, error: e instanceof Error ? e.message : '获取邀请总览失败' }
    }
  }

  /**
   * Run a one-shot analyze request. Sends `initial-start` then either
   * `solution-stream-complete` (success) or `solution-stream-error` (failure)
   * to the overlay window, preserving the legacy event names so the renderer
   * keeps working without changes.
   */
  public async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const operationId = options.operationId || crypto.randomUUID()
    const attempt = Math.max(1, Math.trunc(options.attempt || 1))
    const requestId = options.requestId || `desktop-${crypto.randomUUID()}`
    const diagnosticContext = { operationId, requestId, attempt }
    const token = this.configHelper.getAuthToken()
    if (!token) {
      const payload = errorPayload('未登录，请先登录账号。', 'AUTH_REQUIRED', 'auth', { ...diagnosticContext, action: 'none' })
      appendDiagnosticLog('analyze.reject', payload)
      this.lastDiagnostic = payload
      this.sendEvent('processing-unauthorized', payload)
      return { success: false, error: '未登录', errorCode: 'AUTH_REQUIRED', stage: 'auth' }
    }
    if (!options.images || options.images.length === 0) {
      const payload = errorPayload('请先截图后再搜题。', 'NO_SCREENSHOTS', 'validate-image', { ...diagnosticContext, action: 'retry' })
      appendDiagnosticLog('analyze.reject', payload)
      this.lastDiagnostic = payload
      this.sendEvent('processing-no-screenshots', payload)
      return { success: false, error: '没有截图', errorCode: 'NO_SCREENSHOTS', stage: 'input' }
    }

    this.sendEvent('initial-start', { mode: options.mode, imageCount: options.images.length, ...diagnosticContext })

    const deviceId = this.configHelper.getUserConfig().clientSettings?.deviceId || ''

    this.currentController = new AbortController()
    const startedAt = Date.now()
    let currentStage: AnalysisStage = 'validate-image'
    let screenshotBytes = 0
    try {
      // Decode is part of the operation timeline so corrupt/empty input cannot
      // bypass the structured error payload and diagnostic log.
      const screenshot = decodeImageData(options.images[0])
      screenshotBytes = screenshot.buffer.length
      console.log('[ProcessingHelper] analyze:', {
        mode: options.mode,
        imageCount: options.images.length,
        imageBytes: screenshotBytes,
        hasToken: !!token,
        deviceId: deviceId || '(empty)',
        apiBaseUrl: this.configHelper.getAppConfig().apiBaseUrl,
      })
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
        currentStage = 'upload-ticket'
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
        currentStage = 'upload'
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

      currentStage = 'analyze-request'
      const { data, envelope } = await postActionEnvelope<Record<string, unknown>>(
        endpoint,
        'analyze',
        analyzeInput,
        { timeoutMs: this.configHelper.getAppConfig().httpTimeoutMs, signal: this.currentController.signal }
      )
      // data 已经是 envelope.data 的内容 (postActionEnvelope 已解包)
      currentStage = 'parse-result'
      const structured = parseStructuredAnswer(data)
      const answer = structured.answer || (structured.code ? '参考代码' : firstText(data, ['answer', 'result', 'content', 'text', 'raw', 'note']))
      const explanation = structured.explanation || firstText(data, ['explanation', 'analysis', 'reasoning', 'detail'])
      const code = structured.code
      if (!answer && !explanation) {
        const payload = errorPayload('模型没有返回有效结果。当前截图已保留，可直接重试。', 'EMPTY_RESULT', 'parse-result', { ...diagnosticContext, action: 'retry' })
        appendDiagnosticLog('analyze.error', { ...payload, requestId, imageBytes: screenshot.buffer.length, totalMs: Date.now() - startedAt })
        this.lastDiagnostic = payload
        this.sendEvent('solution-stream-error', payload)
        return { success: false, error: '模型没有返回有效结果', errorCode: 'EMPTY_RESULT', stage: 'parse' }
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
      appendDiagnosticLog('analyze.success', {
        ...diagnosticContext,
        requestId,
        imageBytes: screenshot.buffer.length,
        totalMs: Date.now() - startedAt,
        creditCost: result.creditCost,
        creditBalance: result.creditBalance,
      })
      this.lastDiagnostic = { ...diagnosticContext, stage: 'complete', code: 'OK', totalMs: Date.now() - startedAt }

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
          ...diagnosticContext,
          rawContent: JSON.stringify(data, null, 2),
          raw: data,
        })
      }
      return result
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error('[ProcessingHelper] analyze error:', error.message, e instanceof ApiError && e.code ? `(code: ${e.code})` : '')
      const code = e instanceof ApiError ? e.code : 'UNKNOWN'
      const stage: AnalysisStage = e instanceof ApiError
        ? e.kind === 'auth' ? 'auth'
          : e.kind === 'credits' ? 'credits'
            : e.kind === 'timeout' ? 'timeout'
              : e.kind === 'network' ? 'network'
                : currentStage
        : currentStage || 'unknown'
      appendDiagnosticLog('analyze.error', {
        ...diagnosticContext,
        requestId,
        code,
        stage,
        message: error.message,
        imageBytes: screenshotBytes,
        totalMs: Date.now() - startedAt,
      })
      const common = { ...diagnosticContext, action: 'retry' as const }
      if (e instanceof ApiError) {
        if (e.kind === 'auth') {
          this.lastDiagnostic = errorPayload(e.message, e.code, 'auth', { ...diagnosticContext, action: 'none' })
          this.sendEvent('processing-unauthorized', this.lastDiagnostic)
        } else if (e.kind === 'credits') {
          this.lastDiagnostic = errorPayload(e.message, e.code, 'credits', { ...diagnosticContext, action: 'none' })
          this.sendEvent('out-of-credits', this.lastDiagnostic)
        } else if (e.kind === 'timeout') {
          this.lastDiagnostic = errorPayload('分析超时，截图已保留且不会由客户端重复扣分。', e.code, 'timeout', common)
          this.sendEvent('solution-stream-error', this.lastDiagnostic)
        } else {
          this.lastDiagnostic = errorPayload(e.message, e.code, stage, common)
          this.sendEvent('solution-stream-error', this.lastDiagnostic)
        }
        return { success: false, error: e.message, errorCode: e.code, stage }
      }
      this.lastDiagnostic = errorPayload(error.message, 'UNKNOWN', stage, common)
      this.sendEvent('solution-stream-error', this.lastDiagnostic)
      return { success: false, error: error.message, errorCode: 'UNKNOWN', stage }
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

  public getLastDiagnosticSummary(): Record<string, unknown> {
    return { ...this.lastDiagnostic }
  }

  public copyLastDiagnosticSummary(): boolean {
    return diagnostics.copySummary({ kind: 'exam-analysis', ...this.lastDiagnostic })
  }

  public openDiagnosticFolder(): Promise<boolean> {
    return diagnostics.openFolder()
  }

  public recordDiagnosticEvent(event: string, details: Record<string, unknown>): void {
    appendDiagnosticLog(event, details)
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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data)
    }
  }
}
