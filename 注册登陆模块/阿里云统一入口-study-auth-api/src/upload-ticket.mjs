import crypto from 'node:crypto'

function accountDigest(accountToken) {
  return crypto.createHash('sha256').update(String(accountToken || ''), 'utf8').digest('base64url')
}

function signature(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createUploadTicketService(secret, ttlSeconds = 300) {
  const key = String(secret || '').trim()
  if (key.length < 32) throw new Error('UPLOAD_TICKET_SECRET must contain at least 32 characters')

  return {
    issue({ accountToken, objectKey, now = Date.now() }) {
      const body = {
        v: 1,
        sub: accountDigest(accountToken),
        key: String(objectKey || ''),
        exp: Math.floor(now / 1000) + ttlSeconds,
        nonce: crypto.randomBytes(12).toString('base64url')
      }
      const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
      return `v1.${payload}.${signature(key, payload)}`
    },

    verify(ticket, { accountToken, objectKey, now = Date.now() }) {
      const parts = String(ticket || '').split('.')
      if (parts.length !== 3 || parts[0] !== 'v1') return false
      const [, payload, suppliedSignature] = parts
      if (!safeEqual(signature(key, payload), suppliedSignature)) return false
      let body
      try { body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return false }
      return body?.v === 1 &&
        body.exp > Math.floor(now / 1000) &&
        safeEqual(body.sub, accountDigest(accountToken)) &&
        safeEqual(body.key, String(objectKey || ''))
    }
  }
}
