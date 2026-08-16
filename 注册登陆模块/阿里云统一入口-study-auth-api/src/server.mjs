import http from 'node:http'
import { loadConfig } from './config.mjs'
import { createGatewayHandler } from './gateway.mjs'
import { createVisionService } from './vision.mjs'
import { createUploadTicketService } from './upload-ticket.mjs'
import { createOssStorage } from './oss-storage.mjs'

const config = loadConfig()
const storage = createOssStorage(config)
const vision = createVisionService(config)
const uploadTickets = createUploadTicketService(config.uploadTicketSecret, config.uploadTtlSeconds)
const server = http.createServer(createGatewayHandler({ config, storage, vision, uploadTickets }))

server.requestTimeout = config.upstreamTimeoutMs + 15_000
server.headersTimeout = 20_000
server.keepAliveTimeout = 5_000

server.listen(config.port, config.host, () => {
  console.log(`[gateway] listening on ${config.host}:${config.port}`)
})

function shutdown(signal) {
  console.log(`[gateway] ${signal}, shutting down`)
  server.close((error) => process.exit(error ? 1 : 0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
