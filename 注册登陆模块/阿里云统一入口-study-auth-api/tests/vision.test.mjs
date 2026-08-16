import assert from 'node:assert/strict'
import test from 'node:test'
import { createVisionService } from '../src/vision.mjs'

// 通用 mock 配置
function makeConfig(overrides = {}) {
  return {
    visionApiFormat: 'openai',
    visionBaseUrl: 'https://api.example.com',
    visionApiKey: 'test-key',
    visionModel: 'test-vision-model',
    visionApiPath: '',
    visionSystemPrompt: '',
    visionTimeoutMs: 2_000,
    ocrFallbackEnabled: true,
    ocrTimeoutMs: 2_000,
    maxScreenshotBytes: 1024,
    ...overrides
  }
}

// 通用 mock fetch：先下载图片，再调用 VLM API
function makeFetchImpl(vlmResponse) {
  return async (url, init) => {
    if (String(url).startsWith('https://bucket.example/')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      })
    }
    return new Response(JSON.stringify(vlmResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
}

// ============ OpenAI Chat Completions 格式 ============

test('openai: sends image_url with Bearer auth and parses choices[0].message.content', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (String(url).startsWith('https://bucket.example/')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '识别到题目：2 + 2 = ?' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const vision = createVisionService(makeConfig({ visionApiFormat: 'openai' }), fetchImpl, async () => { throw new Error('OCR must not be called') })

  const result = await vision.analyzeUrl('https://bucket.example/signed-image')
  assert.match(result, /2 \+ 2/)

  const vlmCall = calls[1]
  assert.equal(vlmCall.url, 'https://api.example.com/v1/chat/completions')
  assert.equal(vlmCall.init.headers.authorization, 'Bearer test-key')
  const body = JSON.parse(vlmCall.init.body)
  assert.equal(body.model, 'test-vision-model')
  assert.equal(body.messages[0].role, 'user')
  const content = body.messages[0].content
  assert.ok(content.some((c) => c.type === 'text'))
  assert.ok(content.some((c) => c.type === 'image_url' && c.image_url.url.startsWith('data:image/jpeg;base64,')))
})

// ============ Anthropic Messages 格式 ============

test('anthropic: sends image source with x-api-key and parses content[0].text', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (String(url).startsWith('https://bucket.example/')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      })
    }
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: '识别到题目：3 + 5 = ?' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const vision = createVisionService(makeConfig({
    visionApiFormat: 'anthropic',
    visionBaseUrl: 'https://api.anthropic.example.com'
  }), fetchImpl, async () => { throw new Error('OCR must not be called') })

  const result = await vision.analyzeUrl('https://bucket.example/signed-image')
  assert.match(result, /3 \+ 5/)

  const vlmCall = calls[1]
  assert.equal(vlmCall.url, 'https://api.anthropic.example.com/v1/messages')
  assert.equal(vlmCall.init.headers['x-api-key'], 'test-key')
  assert.equal(vlmCall.init.headers['anthropic-version'], '2023-06-01')
  const body = JSON.parse(vlmCall.init.body)
  assert.equal(body.model, 'test-vision-model')
  const content = body.messages[0].content
  assert.ok(content.some((c) => c.type === 'image' && c.source.type === 'base64'))
  assert.ok(content.some((c) => c.type === 'text'))
})

// ============ MiniMax 专有 VLM 格式（向后兼容）============

test('minimax: sends prompt+image_url with Bearer auth and parses content field', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (String(url).startsWith('https://bucket.example/')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      })
    }
    return new Response(JSON.stringify({
      content: '识别到题目：4 + 4 = ?',
      base_resp: { status_code: 0 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const vision = createVisionService(makeConfig({
    visionApiFormat: 'minimax',
    visionBaseUrl: 'https://api.minimaxi.com'
  }), fetchImpl, async () => { throw new Error('OCR must not be called') })

  const result = await vision.analyzeUrl('https://bucket.example/signed-image')
  assert.match(result, /4 \+ 4/)

  const vlmCall = calls[1]
  assert.equal(vlmCall.url, 'https://api.minimaxi.com/v1/coding_plan/vlm')
  assert.equal(vlmCall.init.headers.authorization, 'Bearer test-key')
  assert.equal(vlmCall.init.headers['mm-api-source'], 'Minimax-MCP')
  const body = JSON.parse(vlmCall.init.body)
  assert.ok(body.image_url.startsWith('data:image/jpeg;base64,'))
  assert.match(body.prompt, /不要替用户作答/)
})

// ============ OCR 回退逻辑 ============

test('falls back to local OCR when VLM rejects the image', async () => {
  const fetchImpl = makeFetchImpl({ content: '', base_resp: { status_code: 1026, status_msg: 'input image sensitive' } })
  let ocrImageLength = 0
  const ocrImpl = async (image) => {
    ocrImageLength = image.length
    return '备用识别结果：题目与选项'
  }
  const vision = createVisionService(makeConfig({ visionApiFormat: 'minimax' }), fetchImpl, ocrImpl)

  const result = await vision.analyzeUrl('https://bucket.example/rejected-image')
  assert.equal(ocrImageLength, 4)
  assert.match(result, /本地 OCR 备用通道/)
  assert.match(result, /题目与选项/)
})

test('falls back to local OCR when API key is missing', async () => {
  let requestCount = 0
  const fetchImpl = async () => {
    requestCount += 1
    return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200, headers: { 'content-type': 'image/jpeg' }
    })
  }
  const vision = createVisionService(makeConfig({ visionApiKey: '' }), fetchImpl, async () => '备用识别结果：题目与选项')

  const result = await vision.analyzeUrl('https://bucket.example/signed-image')
  assert.equal(requestCount, 1)
  assert.match(result, /题目与选项/)
})

test('uses high-confidence local OCR without calling VLM', async () => {
  let fetchCount = 0
  const vision = createVisionService(makeConfig({ ocrMinChars: 20, ocrMinConfidence: 65 }), async () => { fetchCount += 1; throw new Error('VLM must not be called') }, async () => ({
    text: '这是一个足够清晰的题目文字，选项为 A、B、C、D。',
    confidence: 92
  }))

  const result = await vision.analyzeImage(Buffer.from([1, 2, 3]), 'image/jpeg')
  assert.match(result, /本地 OCR 识别/)
  assert.equal(fetchCount, 0)
})

// ============ 自定义请求路径 ============

test('openai: respects custom visionApiPath', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url })
    if (String(url).startsWith('https://bucket.example/')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const vision = createVisionService(makeConfig({ visionApiPath: '/custom/vision' }), fetchImpl, async () => { throw new Error('no OCR') })

  await vision.analyzeUrl('https://bucket.example/img')
  assert.equal(calls[1].url, 'https://api.example.com/custom/vision')
})
