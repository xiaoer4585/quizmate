import OSS from 'ali-oss'
import crypto from 'node:crypto'

const METADATA_BASE = 'http://100.100.100.200/latest'

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

async function metadataRequest(path, options = {}) {
  const timeout = withTimeout(2_500)
  try {
    const response = await fetch(`${METADATA_BASE}${path}`, { ...options, signal: timeout.signal })
    if (!response.ok) throw new Error(`ECS metadata request failed: ${response.status}`)
    return response.text()
  } finally {
    timeout.clear()
  }
}

export function createEcsCredentialProvider(roleName) {
  let cached = null
  let metadataToken = ''
  let metadataTokenExpiresAt = 0

  async function getMetadataToken() {
    if (metadataToken && metadataTokenExpiresAt > Date.now() + 60_000) return metadataToken
    try {
      metadataToken = await metadataRequest('/api/token', {
        method: 'PUT',
        headers: { 'X-aliyun-ecs-metadata-token-ttl-seconds': '21600' }
      })
      metadataTokenExpiresAt = Date.now() + 21_000_000
      return metadataToken
    } catch {
      return ''
    }
  }

  return async function getCredentials() {
    if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached
    const token = await getMetadataToken()
    const headers = token ? { 'X-aliyun-ecs-metadata-token': token } : {}
    const raw = await metadataRequest(`/meta-data/ram/security-credentials/${encodeURIComponent(roleName)}`, { headers })
    const data = JSON.parse(raw)
    if (data.Code !== 'Success' || !data.AccessKeyId || !data.AccessKeySecret || !data.SecurityToken) {
      throw new Error('ECS RAM role credentials are unavailable')
    }
    cached = {
      accessKeyId: data.AccessKeyId,
      accessKeySecret: data.AccessKeySecret,
      stsToken: data.SecurityToken,
      expiresAt: Date.parse(data.Expiration || '') || Date.now() + 30 * 60_000
    }
    return cached
  }
}

function extensionFor(contentType) {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

function datePath(now = new Date()) {
  return [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('/')
}

export function createOssStorage(config, credentialProvider = createEcsCredentialProvider(config.ecsRamRoleName)) {
  const expectedHost = `${config.ossBucket}.${config.ossRegion}.aliyuncs.com`.toLowerCase()

  async function client(internal = false) {
    const credentials = await credentialProvider()
    return new OSS({
      region: config.ossRegion,
      bucket: config.ossBucket,
      internal,
      secure: true,
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      stsToken: credentials.stsToken
    })
  }

  function newKey(contentType) {
    return `${config.ossPrefix}${datePath()}/${crypto.randomUUID()}.${extensionFor(contentType)}`
  }

  async function signedReadUrl(objectKey) {
    const oss = await client()
    return oss.signatureUrl(objectKey, { expires: config.readTtlSeconds, method: 'GET' })
  }

  return {
    async createUploadUrls(contentType) {
      const objectKey = newKey(contentType)
      const oss = await client()
      const uploadUrl = oss.signatureUrl(objectKey, {
        expires: config.uploadTtlSeconds,
        method: 'PUT',
        'Content-Type': contentType
      })
      const screenshotUrl = oss.signatureUrl(objectKey, { expires: config.readTtlSeconds, method: 'GET' })
      return { objectKey, uploadUrl, screenshotUrl }
    },

    signedReadUrl,

    async uploadBuffer(buffer, contentType) {
      const objectKey = newKey(contentType)
      const oss = await client()
      await oss.put(objectKey, buffer, { headers: { 'Content-Type': contentType } })
      return { objectKey, screenshotUrl: await signedReadUrl(objectKey) }
    },

    validateObjectKey(value) {
      const objectKey = String(value || '')
      return objectKey.startsWith(config.ossPrefix) &&
        !objectKey.includes('..') &&
        !objectKey.includes('\\') &&
        /\.(?:jpe?g|png|webp)$/i.test(objectKey)
    },

    async readObject(objectKey) {
      if (!this.validateObjectKey(objectKey)) throw new Error('invalid managed object key')
      const oss = await client(true)
      const result = await oss.get(objectKey)
      const contentType = String(result.res?.headers?.['content-type'] || result.res?.headers?.['Content-Type'] || '').split(';')[0].trim().toLowerCase()
      return { buffer: Buffer.from(result.content), contentType }
    },

    validateReadUrl(value) {
      try {
        const url = new URL(String(value || ''))
        const objectKey = decodeURIComponent(url.pathname.replace(/^\//, ''))
        const expires = Number(url.searchParams.get('Expires') || url.searchParams.get('x-oss-expires') || 0)
        const hasSignature = Boolean(url.searchParams.get('Signature') || url.searchParams.get('x-oss-signature'))
        return url.protocol === 'https:' &&
          url.hostname.toLowerCase() === expectedHost &&
          objectKey.startsWith(config.ossPrefix) &&
          hasSignature &&
          expires > Math.floor(Date.now() / 1000)
      } catch {
        return false
      }
    }
  }
}
