import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { createGatewayHandler } from '../src/gateway.mjs'

function makeConfig() {
  return {
    upstreamUrl: 'https://upstream.example/study-auth-api',
    upstreamTimeoutMs: 2_000,
    maxBodyBytes: 2 * 1024 * 1024,
    maxScreenshotBytes: 1024 * 1024,
    uploadTtlSeconds: 300,
    uploadTicketSecret: 'test-upload-ticket-secret-0123456789abcdef',
    readTtlSeconds: 900,
    corsOrigins: ['*'],
    version: 'test'
  }
}

function makeStorage() {
  return {
    uploaded: [],
    async createUploadUrls() {
      return {
        objectKey: 'screenshots/test/image.jpg',
        uploadUrl: 'https://bucket.example/upload-signed',
        screenshotUrl: 'https://bucket.example/screenshots/test/image.jpg?Expires=9999999999&Signature=ok'
      }
    },
    async uploadBuffer(buffer, contentType) {
      this.uploaded.push({ buffer, contentType })
      return {
        objectKey: 'screenshots/test/legacy.jpg',
        screenshotUrl: 'https://bucket.example/screenshots/test/legacy.jpg?Expires=9999999999&Signature=ok'
      }
    },
    async signedReadUrl(objectKey) {
      return `https://bucket.example/${objectKey}?Expires=9999999999&Signature=ok`
    },
    validateReadUrl(value) {
      return String(value).startsWith('https://bucket.example/screenshots/')
    },
    validateObjectKey(value) {
      return String(value).startsWith('screenshots/') && !String(value).includes('..')
    },
    async readObject(objectKey) {
      return { buffer: Buffer.from(`image:${objectKey}`), contentType: 'image/jpeg' }
    }
  }
}

function makeVision() {
  return {
    analyzed: [],
    async analyzeUrl(url) {
      this.analyzed.push(url)
      return '识别到的题目：2 + 2 = ?，选项 A.3 B.4 C.5'
    },
    async analyzeImage(buffer) {
      this.analyzed.push(`buffer:${buffer.length}`)
      return '识别到的题目：2 + 2 = ?，选项 A.3 B.4 C.5'
    }
  }
}

async function withServer(options, run) {
  const server = http.createServer(createGatewayHandler({ vision: makeVision(), ...options }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

test('health identifies the compatibility gateway', async () => {
  await withServer({ config: makeConfig(), storage: makeStorage(), fetchImpl: async () => responseJson({}) }, async (base) => {
    const response = await fetch(`${base}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok', version: 'test', storage: 'oss', upstream: 'aliyun-primary' })
  })
})

test('study API cannot be browsed with GET', async () => {
  await withServer({ config: makeConfig(), storage: makeStorage(), fetchImpl: async () => responseJson({}) }, async (base) => {
    const response = await fetch(`${base}/study-auth-api`)
    assert.equal(response.status, 404)
    assert.equal((await response.json()).code, 'NOT_FOUND')
  })
})

test('creates signed upload URLs only after account validation', async () => {
  const calls = []
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body.toString()))
    return responseJson({ ok: true, data: { account: { credits: 70 } } })
  }
  await withServer({ config: makeConfig(), storage: makeStorage(), fetchImpl }, async (base) => {
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'createScreenshotUpload', accountToken: '1234567890123456', contentType: 'image/jpeg', sizeBytes: 200000 })
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.data.method, 'PUT')
    assert.match(body.data.uploadTicket, /^v1\./)
    assert.equal(calls[0].action, 'getAccountProfile')
  })
})

test('uses a valid upload ticket without a second account profile call', async () => {
  const storage = makeStorage()
  const vision = makeVision()
  const calls = []
  let upstreamInput
  const fetchImpl = async (_url, init) => {
    const input = JSON.parse(init.body.toString())
    calls.push(input.action)
    if (input.action === 'getAccountProfile') return responseJson({ ok: true, data: { account: { credits: 70 } } })
    upstreamInput = input
    return responseJson({ ok: true, data: { items: [{ answer: 'B', explanation: 'ok' }] } })
  }
  await withServer({ config: makeConfig(), storage, vision, fetchImpl }, async (base) => {
    const accountToken = '1234567890123456'
    const uploadResponse = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'createScreenshotUpload', accountToken, contentType: 'image/jpeg', sizeBytes: 200000 })
    })
    const upload = (await uploadResponse.json()).data
    const analyzeResponse = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'analyze', accountToken, requestId: 'request-modern-001', objectKey: upload.objectKey, uploadTicket: upload.uploadTicket, source: 'screen' })
    })
    assert.equal(analyzeResponse.status, 200)
    assert.deepEqual(calls, ['getAccountProfile', 'analyze'])
    // Managed OSS objects are read internally and sent as image bytes, so the
    // external vision model does not need to download a private signed URL.
    assert.equal(vision.analyzed.length, 0)
    assert.equal(upstreamInput.screenshot, `data:image/jpeg;base64,${Buffer.from('image:screenshots/test/image.jpg').toString('base64')}`)
    assert.equal('screenshotUrl' in upstreamInput, false)
    assert.equal('objectKey' in upstreamInput, false)
  })
})

test('rejects a tampered upload ticket before reading OSS or calling upstream', async () => {
  const storage = makeStorage()
  let upstreamCalls = 0
  const fetchImpl = async () => { upstreamCalls += 1; return responseJson({}) }
  await withServer({ config: makeConfig(), storage, fetchImpl }, async (base) => {
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze', accountToken: '1234567890123456', objectKey: 'screenshots/test/image.jpg',
        uploadTicket: 'v1.invalid.invalid', source: 'screen'
      })
    })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, 'INVALID_UPLOAD_TICKET')
    assert.equal(upstreamCalls, 0)
  })
})

test('rewrites a pre-uploaded screenshot URL before proxying analyze', async () => {
  let upstreamInput
  const vision = makeVision()
  const fetchImpl = async (_url, init) => {
    const input = JSON.parse(init.body.toString())
    if (input.action === 'getAccountProfile') return responseJson({ ok: true, data: { account: { credits: 70 } } })
    upstreamInput = input
    return responseJson({ ok: true, data: { items: [{ answer: 'A', explanation: 'ok' }] } })
  }
  await withServer({ config: makeConfig(), storage: makeStorage(), vision, fetchImpl }, async (base) => {
    const screenshotUrl = 'https://bucket.example/screenshots/test/image.jpg?Expires=9999999999&Signature=ok'
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'analyze', accountToken: '1234567890123456', screenshotUrl, source: 'screen' })
    })
    assert.equal(response.status, 200)
    // 性能优化：不再调用 vision，直接把 screenshotUrl 作为 screenshot 字段传给上游 LLM
    assert.equal(vision.analyzed.length, 0)
    assert.equal(upstreamInput.screenshot, screenshotUrl)
    assert.equal('screenshotUrl' in upstreamInput, false)
    assert.equal('pageContext' in upstreamInput, false)
  })
})

test('accepts legacy screenshots larger than the CloudBase body limit and proxies only a URL', async () => {
  const storage = makeStorage()
  const vision = makeVision()
  let upstreamInput
  const fetchImpl = async (_url, init) => {
    const input = JSON.parse(init.body.toString())
    if (input.action === 'getAccountProfile') return responseJson({ ok: true, data: { account: { credits: 70 } } })
    upstreamInput = input
    return responseJson({ ok: true, data: { items: [{ answer: 'B', explanation: 'ok' }] } })
  }
  await withServer({ config: makeConfig(), storage, vision, fetchImpl }, async (base) => {
    const screenshot = Buffer.alloc(180 * 1024, 7).toString('base64')
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'analyze', accountToken: '1234567890123456', screenshot, source: 'screen' })
    })
    assert.equal(response.status, 200)
    // 性能优化：不再上传 OSS 也不再调用 vision，直接把 base64 截图传给上游 LLM
    assert.equal(storage.uploaded.length, 0)
    assert.equal(vision.analyzed.length, 0)
    assert.equal(upstreamInput.screenshot.startsWith('data:image/jpeg;base64,'), true)
    assert.equal('pageContext' in upstreamInput, false)
  })
})

test('rejects screenshot URLs outside the private bucket', async () => {
  let called = false
  await withServer({ config: makeConfig(), storage: makeStorage(), fetchImpl: async () => { called = true; return responseJson({}) } }, async (base) => {
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'analyze', screenshotUrl: 'https://evil.example/image.jpg' })
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, 'INVALID_SCREENSHOT_URL')
    assert.equal(called, false)
  })
})

test('proxies unrelated actions without changing their envelope', async () => {
  let upstreamInput
  const fetchImpl = async (_url, init) => {
    upstreamInput = JSON.parse(init.body.toString())
    return responseJson({ ok: true, data: { enabled: true } })
  }
  await withServer({ config: makeConfig(), storage: makeStorage(), fetchImpl }, async (base) => {
    const response = await fetch(`${base}/study-auth-api`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'getPaymentConfig', client: 'desktop' })
    })
    assert.deepEqual(await response.json(), { ok: true, data: { enabled: true } })
    assert.deepEqual(upstreamInput, { action: 'getPaymentConfig', client: 'desktop' })
  })
})
