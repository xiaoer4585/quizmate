import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '.', getVersion: () => '2026.8.28' },
  clipboard: { writeText: vi.fn() },
  shell: { openPath: vi.fn(async () => '') },
}));

describe('diagnostic sanitizer', () => {
  let sanitizeDiagnosticDetails: (details: Record<string, unknown>) => Record<string, unknown>;

  beforeAll(async () => {
    ({ sanitizeDiagnosticDetails } = await import('../../electron/helpers/DiagnosticLogger'));
  });

  it('removes screenshots, audio, transcripts, paths, credentials and signed URLs', () => {
    const sanitized = sanitizeDiagnosticDetails({
      token: 'secret',
      apiKey: 'secret',
      screenshot: 'base64-data',
      transcript: 'private text',
      filePath: '/Users/private/file.png',
      nested: { authorization: 'Bearer secret', safeCode: 'ASR_RECONNECT_EXHAUSTED' },
      endpoint: 'https://example.com/object?signature=secret',
      phase: 'reconnecting',
    });
    expect(sanitized).toEqual({
      nested: { safeCode: 'ASR_RECONNECT_EXHAUSTED' },
      endpoint: '[url]',
      phase: 'reconnecting',
    });
  });

  it('keeps aggregate latency metrics without retaining interview content', () => {
    const sanitized = sanitizeDiagnosticDetails({
      questionChars: 28,
      contextChars: 19600,
      slotWaitMs: 0,
      api: { fetchMs: 160, responseBodyMs: 4, parseMs: 1, requestBytes: 25000 },
      resumeText: 'private resume',
      jobDescription: 'private JD',
      recentTranscript: 'private question',
    });
    expect(sanitized).toEqual({
      questionChars: 28,
      contextChars: 19600,
      slotWaitMs: 0,
      api: { fetchMs: 160, responseBodyMs: 4, parseMs: 1, requestBytes: 25000 },
    });
  });
});
