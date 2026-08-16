function positiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase())
}

export function loadConfig(source = process.env) {
  return {
    host: source.HOST || '127.0.0.1',
    port: positiveInt(source.PORT, 8100),
    upstreamUrl: source.UPSTREAM_URL || 'http://127.0.0.1:8200/study-auth-api',
    upstreamTimeoutMs: positiveInt(source.UPSTREAM_TIMEOUT_MS, 90_000),
    // 视觉模型通用配置：支持 openai（Chat Completions）、anthropic（Messages）、minimax（专有 VLM，向后兼容）三种格式
    visionApiFormat: String(source.VISION_API_FORMAT || 'openai').trim().toLowerCase(),
    visionBaseUrl: String(source.VISION_BASE_URL || '').trim().replace(/\/+$/, ''),
    visionApiKey: String(source.VISION_API_KEY || '').trim(),
    visionModel: String(source.VISION_MODEL || '').trim(),
    visionApiPath: String(source.VISION_API_PATH || '').trim(),
    visionSystemPrompt: String(source.VISION_SYSTEM_PROMPT || '').trim(),
    visionTimeoutMs: positiveInt(source.VISION_TIMEOUT_MS, 90_000),
    ocrFallbackEnabled: enabled(source.OCR_FALLBACK_ENABLED, true),
    ocrCommand: source.OCR_COMMAND || '/usr/bin/tesseract',
    ocrLanguages: source.OCR_LANGUAGES || 'chi_sim+eng',
    ocrTimeoutMs: positiveInt(source.OCR_TIMEOUT_MS, 45_000),
    ocrMinChars: positiveInt(source.OCR_MIN_CHARS, 30),
    ocrMinConfidence: positiveInt(source.OCR_MIN_CONFIDENCE, 65),
    maxBodyBytes: positiveInt(source.MAX_BODY_BYTES, 8 * 1024 * 1024),
    maxScreenshotBytes: positiveInt(source.MAX_SCREENSHOT_BYTES, 6 * 1024 * 1024),
    uploadTtlSeconds: positiveInt(source.UPLOAD_TTL_SECONDS, 300),
    uploadTicketSecret: String(source.UPLOAD_TICKET_SECRET || '').trim(),
    readTtlSeconds: positiveInt(source.READ_TTL_SECONDS, 900),
    ossRegion: source.OSS_REGION || 'oss-cn-beijing',
    ossBucket: source.OSS_BUCKET || 'quizmate-ai-screenshots-cuolemo',
    ossPrefix: source.OSS_PREFIX || 'screenshots/',
    ecsRamRoleName: source.ECS_RAM_ROLE_NAME || 'QuizMateOssGatewayRole',
    corsOrigins: (source.CORS_ORIGINS || '*').split(',').map((item) => item.trim()).filter(Boolean),
    version: source.APP_VERSION || '1.0.0'
  }
}
