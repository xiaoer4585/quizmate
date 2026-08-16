import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const DEFAULT_VISION_PROMPT = [
  '请完整识别并理解这张截图中的学习内容。',
  '逐题保留题干、选项、公式、代码、表格和图示中的关键信息；多道题按原顺序分隔。',
  '只做忠实的内容提取与结构化描述，不要猜测看不清的文字，也不要替用户作答。'
].join('\n')

// 各 API 格式的默认请求路径
const DEFAULT_API_PATHS = {
  openai: '/v1/chat/completions',
  anthropic: '/v1/messages',
  minimax: '/v1/coding_plan/vlm'
}

class VisionError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}

function recognizeWithTesseract(image, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ocrCommand, [
      'stdin',
      'stdout',
      '-l',
      config.ocrLanguages,
      '--psm',
      '11',
      'tsv'
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const stdout = []
    const stderr = []
    let outputBytes = 0
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new VisionError('本地 OCR 响应超时。', 'OCR_TIMEOUT')))
    }, config.ocrTimeoutMs)

    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length
      if (outputBytes > 512 * 1024) {
        child.kill('SIGKILL')
        finish(() => reject(new VisionError('本地 OCR 输出过大。', 'OCR_OUTPUT_TOO_LARGE')))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.reduce((total, item) => total + item.length, 0) < 32 * 1024) stderr.push(chunk)
    })
    child.on('error', () => finish(() => reject(new VisionError('本地 OCR 未安装。', 'OCR_NOT_AVAILABLE'))))
    child.on('close', (code) => finish(() => {
      const tsv = Buffer.concat(stdout).toString('utf8').replace(/\r/g, '').trim()
      const rows = tsv.split('\n').slice(1).map((line) => line.split('\t')).filter((cols) => cols.length >= 12)
      const words = rows.map((cols) => ({ confidence: Number(cols[10]), text: cols.slice(11).join('\t').trim() }))
        .filter((word) => word.text && Number.isFinite(word.confidence) && word.confidence >= 0)
      const text = words.map((word) => word.text).join(' ').trim()
      const confidence = words.length ? words.reduce((total, word) => total + word.confidence, 0) / words.length : 0
      if (code !== 0 || text.length < 4) {
        reject(new VisionError('本地 OCR 未识别到有效文字。', 'OCR_EMPTY', {
          exitCode: code,
          stderrLength: Buffer.concat(stderr).length
        }))
        return
      }
      resolve({ text, confidence })
    }))
    child.stdin.on('error', () => {})
    child.stdin.end(image)
  })
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new VisionError('图像识别服务响应超时。', 'VISION_TIMEOUT')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function resolveEndpoint(config) {
  const baseUrl = String(config.visionBaseUrl || '').replace(/\/+$/, '')
  const apiPath = String(config.visionApiPath || '') || DEFAULT_API_PATHS[config.visionApiFormat] || DEFAULT_API_PATHS.openai
  return `${baseUrl}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`
}

function getPrompt(config) {
  return config.visionSystemPrompt || DEFAULT_VISION_PROMPT
}

// ---- OpenAI Chat Completions 格式 ----
async function callOpenAIVision(config, image, contentType, fetchImpl) {
  if (!config.visionBaseUrl || !config.visionApiKey || !config.visionModel) {
    throw new VisionError('图像识别服务未配置。', 'VISION_NOT_CONFIGURED')
  }
  const endpoint = resolveEndpoint(config)
  const dataUrl = `data:${contentType};base64,${image.toString('base64')}`
  const response = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.visionApiKey}`
    },
    body: JSON.stringify({
      model: config.visionModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: getPrompt(config) },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    })
  }, config.visionTimeoutMs)
  let envelope = null
  try { envelope = await response.json() } catch {}
  const content = String(envelope?.choices?.[0]?.message?.content || '').trim()
  if (!response.ok || !content) {
    throw new VisionError('图像识别服务暂时不可用。', 'VISION_API_FAILED', { httpStatus: response.status })
  }
  return content
}

// ---- Anthropic Messages 格式 ----
async function callAnthropicVision(config, image, contentType, fetchImpl) {
  if (!config.visionBaseUrl || !config.visionApiKey || !config.visionModel) {
    throw new VisionError('图像识别服务未配置。', 'VISION_NOT_CONFIGURED')
  }
  const endpoint = resolveEndpoint(config)
  const base64Data = image.toString('base64')
  const response = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.visionApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.visionModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64Data } },
            { type: 'text', text: getPrompt(config) }
          ]
        }
      ]
    })
  }, config.visionTimeoutMs)
  let envelope = null
  try { envelope = await response.json() } catch {}
  // Anthropic 返回 content 数组，取第一个 text block
  const contentBlock = Array.isArray(envelope?.content) ? envelope.content.find((block) => block.type === 'text') : null
  const content = String(contentBlock?.text || '').trim()
  if (!response.ok || !content) {
    throw new VisionError('图像识别服务暂时不可用。', 'VISION_API_FAILED', { httpStatus: response.status })
  }
  return content
}

// ---- MiniMax 专有 VLM 格式（向后兼容）----
async function callMiniMaxVision(config, image, contentType, fetchImpl) {
  if (!config.visionBaseUrl || !config.visionApiKey) {
    throw new VisionError('图像识别服务未配置。', 'VISION_NOT_CONFIGURED')
  }
  const endpoint = resolveEndpoint(config)
  const response = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.visionApiKey}`,
      'content-type': 'application/json',
      'mm-api-source': 'Minimax-MCP'
    },
    body: JSON.stringify({
      prompt: getPrompt(config),
      image_url: `data:${contentType};base64,${image.toString('base64')}`
    })
  }, config.visionTimeoutMs)
  let envelope = null
  try { envelope = await response.json() } catch {}
  const serviceCode = Number(envelope?.base_resp?.status_code ?? envelope?.baseResp?.statusCode ?? -1)
  const content = String(envelope?.content || '').trim()
  if (!response.ok || serviceCode !== 0 || !content) {
    throw new VisionError('图像识别服务暂时不可用。', 'VISION_API_FAILED', { httpStatus: response.status, serviceCode })
  }
  return content
}

// 根据配置的 apiFormat 分发到对应的调用函数
async function callVisionModel(config, image, contentType, fetchImpl) {
  switch (config.visionApiFormat) {
    case 'anthropic':
      return callAnthropicVision(config, image, contentType, fetchImpl)
    case 'minimax':
      return callMiniMaxVision(config, image, contentType, fetchImpl)
    case 'openai':
    default:
      return callOpenAIVision(config, image, contentType, fetchImpl)
  }
}

export function createVisionService(config, fetchImpl = globalThis.fetch, ocrImpl = recognizeWithTesseract) {
  function normalizeOcr(value) {
    if (typeof value === 'string') return { text: value.trim(), confidence: value.trim().length >= 30 ? 100 : 0 }
    return { text: String(value?.text || '').trim(), confidence: Number(value?.confidence || 0) }
  }

  function acceptableOcr(result) {
    return result.text.length >= Number(config.ocrMinChars || 30) && result.confidence >= Number(config.ocrMinConfidence || 65)
  }

  async function analyzeImage(image, contentType) {
    if (!IMAGE_TYPES.has(contentType)) throw new VisionError('截图格式无效。', 'INVALID_SCREENSHOT_TYPE')
    if (!image.length) throw new VisionError('截图文件为空。', 'EMPTY_SCREENSHOT')
    if (image.length > config.maxScreenshotBytes) throw new VisionError('截图文件过大。', 'SCREENSHOT_TOO_LARGE')

    let ocr = { text: '', confidence: 0 }
    try {
      ocr = normalizeOcr(await ocrImpl(image, config))
      if (acceptableOcr(ocr)) return `以下内容由本地 OCR 识别：\n${ocr.text}`
    } catch (error) {
      if (!config.ocrFallbackEnabled) throw error
    }

    try {
      const content = await callVisionModel(config, image, contentType, fetchImpl)
      return content
    } catch (error) {
      if (config.ocrFallbackEnabled && ocr.text.length >= 4) {
        console.warn('[vision] VLM unavailable, using low-confidence local OCR:', error?.code || 'VISION_ERROR')
        return `以下内容由本地 OCR 备用通道识别，请结合上下文纠正少量错字：\n${ocr.text}`
      }
      throw error
    }
  }

  return {
    analyzeImage,
    async analyzeUrl(screenshotUrl) {
      const imageResponse = await fetchWithTimeout(fetchImpl, screenshotUrl, {
        method: 'GET',
        redirect: 'error'
      }, config.visionTimeoutMs)
      if (!imageResponse.ok) throw new VisionError('无法读取已上传的截图。', 'SCREENSHOT_DOWNLOAD_FAILED')

      const declaredLength = Number(imageResponse.headers.get('content-length') || 0)
      if (declaredLength > config.maxScreenshotBytes) {
        throw new VisionError('截图文件过大。', 'SCREENSHOT_TOO_LARGE')
      }
      const contentType = String(imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!IMAGE_TYPES.has(contentType)) throw new VisionError('截图格式无效。', 'INVALID_SCREENSHOT_TYPE')

      return analyzeImage(Buffer.from(await imageResponse.arrayBuffer()), contentType)
    }
  }
}
