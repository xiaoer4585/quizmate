import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { createUploadTicketService } from './upload-ticket.mjs'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

class PublicError extends Error {
  constructor(message, code = 'INVALID_REQUEST', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function corsHeaders(config, requestOrigin) {
  const wildcard = config.corsOrigins.includes('*')
  const allowed = wildcard || !requestOrigin || config.corsOrigins.includes(requestOrigin)
  return {
    'access-control-allow-origin': allowed ? (wildcard ? '*' : requestOrigin) : 'null',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,X-Client-Version,X-Client-Platform',
    'access-control-max-age': '600',
    'cache-control': 'no-store',
    vary: 'Origin'
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...headers, 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function sendJson(res, status, value, headers = {}) {
  send(res, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8', ...headers })
}

async function readBody(req, limit) {
  const chunks = []
  let total = 0
  let exceeded = false
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) {
      exceeded = true
      continue
    }
    chunks.push(chunk)
  }
  if (exceeded) throw new PublicError('请求内容过大。', 'PAYLOAD_TOO_LARGE', 413)
  return Buffer.concat(chunks)
}

function parseJson(raw) {
  try {
    const value = JSON.parse(raw.toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    return value
  } catch {
    throw new PublicError('请求内容不是有效 JSON。', 'INVALID_JSON')
  }
}

function decodeScreenshot(value, maxBytes) {
  const text = String(value || '').trim()
  let contentType = 'image/jpeg'
  let base64 = text
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is.exec(text)
  if (match) {
    contentType = match[1].toLowerCase()
    base64 = match[2]
  }
  base64 = base64.replace(/\s+/g, '')
  if (!base64 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw new PublicError('截图数据无效。', 'INVALID_SCREENSHOT')
  }
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new PublicError('截图数据为空。', 'INVALID_SCREENSHOT')
  if (buffer.length > maxBytes) throw new PublicError('截图文件过大。', 'SCREENSHOT_TOO_LARGE', 413)
  return { buffer, contentType }
}

function upstreamHeaders(req, contentType) {
  const result = { 'content-type': contentType || 'application/json; charset=utf-8' }
  for (const name of ['x-client-version', 'x-client-platform', 'user-agent']) {
    if (req.headers[name]) result[name] = String(req.headers[name])
  }
  if (req.headers['x-forwarded-for']) result['x-forwarded-for'] = String(req.headers['x-forwarded-for'])
  return result
}

async function callUpstream(config, req, raw, contentType, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs)
  try {
    const response = await fetchImpl(config.upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders(req, contentType),
      body: raw,
      redirect: 'manual',
      signal: controller.signal
    })
    const body = Buffer.from(await response.arrayBuffer())
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type') || 'application/octet-stream'
    }
  } catch (error) {
    if (controller.signal.aborted) throw new PublicError('上游服务响应超时。', 'UPSTREAM_TIMEOUT', 504)
    throw new PublicError('上游服务暂时不可用。', 'UPSTREAM_UNAVAILABLE', 502)
  } finally {
    clearTimeout(timer)
  }
}

function relayUpstream(res, result, cors) {
  send(res, result.status, result.body, { 'content-type': result.contentType, ...cors })
}

async function validateAccount(config, req, input, fetchImpl) {
  const accountToken = String(input.accountToken || '').trim()
  if (accountToken.length < 16) throw new PublicError('请先登录账号。', 'AUTH_REQUIRED', 401)
  const raw = Buffer.from(JSON.stringify({ action: 'getAccountProfile', accountToken }))
  const result = await callUpstream(config, req, raw, 'application/json; charset=utf-8', fetchImpl)
  let envelope = null
  try { envelope = JSON.parse(result.body.toString('utf8')) } catch {}
  return { valid: result.status >= 200 && result.status < 300 && envelope?.ok === true, result }
}

export function createGatewayHandler({ config, storage, vision, uploadTickets, fetchImpl = globalThis.fetch }) {
  const tickets = uploadTickets || createUploadTicketService(config.uploadTicketSecret, config.uploadTtlSeconds)
  return async function gatewayHandler(req, res) {
    const cors = corsHeaders(config, String(req.headers.origin || ''))
    try {
      if (req.method === 'OPTIONS') {
        send(res, 204, '', cors)
        return
      }
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { status: 'ok', version: config.version, storage: 'oss', upstream: 'aliyun-primary' }, cors)
        return
      }
      if (req.method !== 'POST' || String(req.url || '').split('?')[0] !== '/study-auth-api') {
        sendJson(res, 404, { ok: false, code: 'NOT_FOUND', error: '接口不存在。' }, cors)
        return
      }

      const raw = await readBody(req, config.maxBodyBytes)
      const contentType = String(req.headers['content-type'] || 'application/json')
      if (!contentType.toLowerCase().includes('application/json')) {
        relayUpstream(res, await callUpstream(config, req, raw, contentType, fetchImpl), cors)
        return
      }

      const input = parseJson(raw)
      const action = String(input.action || '').trim()
      if (!action) throw new PublicError('缺少操作类型。', 'MISSING_ACTION')

      if (action === 'createScreenshotUpload') {
        const auth = await validateAccount(config, req, input, fetchImpl)
        if (!auth.valid) {
          relayUpstream(res, auth.result, cors)
          return
        }
        const contentTypeValue = String(input.contentType || 'image/jpeg').toLowerCase()
        const sizeBytes = Number(input.sizeBytes || 0)
        if (!IMAGE_TYPES.has(contentTypeValue)) throw new PublicError('不支持这种截图格式。', 'UNSUPPORTED_IMAGE_TYPE')
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > config.maxScreenshotBytes) {
          throw new PublicError('截图大小无效。', 'INVALID_SCREENSHOT_SIZE')
        }
        const urls = await storage.createUploadUrls(contentTypeValue)
        const uploadTicket = tickets.issue({ accountToken: input.accountToken, objectKey: urls.objectKey })
        sendJson(res, 200, {
          ok: true,
          data: {
            ...urls,
            uploadTicket,
            method: 'PUT',
            headers: { 'Content-Type': contentTypeValue },
            expiresAt: new Date(Date.now() + config.uploadTtlSeconds * 1000).toISOString()
          }
        }, cors)
        return
      }

      if (action === 'analyze' && !input.pageContext) {
        const startedAt = Date.now()
        const timings = {}
        const requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(String(input.requestId || ''))
          ? String(input.requestId)
          : `gateway_${crypto.randomUUID()}`
        let screenshotUrl = String(input.screenshotUrl || '').trim()
        let objectKey = String(input.objectKey || '').trim()
        const uploadTicket = String(input.uploadTicket || '').trim()
        const legacyScreenshot = String(input.screenshot || '').trim()
        let decoded = null
        const modernUpload = Boolean(objectKey || uploadTicket)
        if (modernUpload) {
          const accountToken = String(input.accountToken || '').trim()
          if (accountToken.length < 16) throw new PublicError('请先登录账号。', 'AUTH_REQUIRED', 401)
          if (!objectKey || !uploadTicket || !storage.validateObjectKey(objectKey) ||
            !tickets.verify(uploadTicket, { accountToken, objectKey })) {
            throw new PublicError('截图上传凭证无效或已过期。', 'INVALID_UPLOAD_TICKET', 401)
          }
          const ossStarted = Date.now()
          decoded = await storage.readObject(objectKey)
          timings.oss_read_ms = Date.now() - ossStarted
          if (!decoded?.buffer?.length || decoded.buffer.length > config.maxScreenshotBytes) {
            throw new PublicError('截图文件为空或过大。', 'INVALID_SCREENSHOT')
          }
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(decoded.contentType)) {
            throw new PublicError('截图格式无效。', 'INVALID_SCREENSHOT_TYPE')
          }
        } else if (!screenshotUrl && /^https:\/\//i.test(legacyScreenshot)) screenshotUrl = legacyScreenshot
        if (!modernUpload && screenshotUrl) {
          if (!storage.validateReadUrl(screenshotUrl)) {
            throw new PublicError('截图地址无效或已过期。', 'INVALID_SCREENSHOT_URL')
          }
        } else if (!modernUpload) {
          decoded = decodeScreenshot(legacyScreenshot, config.maxScreenshotBytes)
        }
        if (!modernUpload) {
          const authStarted = Date.now()
          const auth = await validateAccount(config, req, input, fetchImpl)
          timings.auth_ms = Date.now() - authStarted
          if (!auth.valid) {
            relayUpstream(res, auth.result, cors)
            return
          }
        }

        // Send image bytes directly to the configured vision model. For managed OSS
        // uploads this avoids making the external model download a private signed URL.
        const upstreamInput = { ...input }

        if (decoded) {
          upstreamInput.screenshot = `data:${decoded.contentType};base64,${decoded.buffer.toString('base64')}`
          delete upstreamInput.screenshotUrl
          delete upstreamInput.objectKey
          delete upstreamInput.uploadTicket
        } else if (screenshotUrl) {
          // URL 路径：直接传 URL 给上游
          upstreamInput.screenshot = screenshotUrl
          delete upstreamInput.screenshotUrl
          delete upstreamInput.objectKey
          delete upstreamInput.uploadTicket
        }

        const upstreamRaw = Buffer.from(JSON.stringify(upstreamInput))
        const upstreamStarted = Date.now()
        const result = await callUpstream(config, req, upstreamRaw, 'application/json; charset=utf-8', fetchImpl)
        timings.upstream_ms = Date.now() - upstreamStarted
        timings.total_ms = Date.now() - startedAt
        console.info('[gateway] analyze timing (direct vision model)', { requestId, imageBytes: decoded?.buffer?.length, mode: modernUpload ? 'oss-internal' : (decoded ? 'base64' : 'url'), ...timings })
        relayUpstream(res, result, cors)
        return
      }

      relayUpstream(res, await callUpstream(config, req, raw, contentType, fetchImpl), cors)
    } catch (error) {
      if (error instanceof PublicError) {
        sendJson(res, error.status, { ok: false, code: error.code, error: error.message }, cors)
        return
      }
      console.error('[gateway] request failed:', error?.message || error)
      sendJson(res, 500, { ok: false, code: 'INTERNAL_ERROR', error: '服务暂时不可用。' }, cors)
    }
  }
}
