import assert from 'node:assert/strict'
import test from 'node:test'
import { createUploadTicketService } from '../src/upload-ticket.mjs'

test('upload tickets bind account, object key and expiry', () => {
  const service = createUploadTicketService('0123456789abcdef0123456789abcdef', 300)
  const now = 1_700_000_000_000
  const input = { accountToken: 'account-token-123456', objectKey: 'screenshots/2026/07/20/a.jpg' }
  const ticket = service.issue({ ...input, now })
  assert.equal(service.verify(ticket, { ...input, now: now + 299_000 }), true)
  assert.equal(service.verify(ticket, { ...input, objectKey: 'screenshots/2026/07/20/b.jpg', now }), false)
  assert.equal(service.verify(ticket, { ...input, accountToken: 'another-account-token', now }), false)
  assert.equal(service.verify(ticket, { ...input, now: now + 301_000 }), false)
  assert.equal(service.verify(`${ticket}x`, { ...input, now }), false)
})
