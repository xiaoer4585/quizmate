import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), analyze: vi.fn(), capture: vi.fn(), stop: vi.fn() }));
vi.mock('../../electron/apiClient', () => ({ postAction: mocks.post }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,test' } }));
vi.mock('../../electron/helpers/ScreenshotHelper', () => ({ ScreenshotHelper: class {
  init() {} captureFullScreen = mocks.capture;
  async getCombinedCompressedScreenshot() { return { dataUrl: 'data:image/png;base64,test' }; }
} }));
vi.mock('../../electron/helpers/ProcessingHelper', () => ({ LightweightProcessingHelper: class {
  analyze = mocks.analyze; cancelStreaming() {}
} }));
import { CompanionController } from '../../electron/helpers/CompanionController';

function fixture() {
  let token = 'desktop-token';
  let settings: Record<string, unknown> = { companionServiceUrl: 'https://test.example/' };
  const controller = new CompanionController({ getAuthToken: () => token, getClientSettings: () => settings,
    updateClientSettings: (patch: object) => { settings = { ...settings, ...patch }; } } as any,
  { stopForWorkspace: mocks.stop, isListening: () => false, start: vi.fn(), getTasks: () => [], getContext: () => ({ audioMode: 'demo' }) } as any, () => {});
  return { controller, changeAccount: () => { token = 'another-account'; } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.post.mockImplementation(async (_url, action) => action === 'createRelayPairing'
    ? { sessionId: 'session', code: '123456', phoneUrl: 'https://test.example/#code=123456' }
    : action === 'relayHeartbeat' ? { connected: true } : { accepted: true });
  mocks.capture.mockResolvedValue({ success: true, filePath: 'capture.png' });
  mocks.analyze.mockResolvedValue({ success: true, raw: { items: [{ summary: 'question', answer: 'answer', explanation: 'reason' }] } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
test('one mobile shortcut captures and analyzes once, while PC workspace cannot capture', async () => {
  const { controller } = fixture();
  await controller.screenshot(); expect(mocks.capture).not.toHaveBeenCalled();
  await controller.pair(); await controller.activate(); await controller.screenshot();
  await controller.sync(); await vi.advanceTimersByTimeAsync(2000);
  expect(mocks.capture).toHaveBeenCalledTimes(1); expect(mocks.analyze).toHaveBeenCalledTimes(1);
  const published = mocks.post.mock.calls.filter(c => c[1] === 'publishRelayResult').map(c => c[2].card);
  expect(published.some(c => c.status === 'done' && c.question === 'question' && c.answer === 'answer')).toBe(true);
});
test('late screenshot answer is discarded when returning to PC', async () => {
  const { controller } = fixture(); let finish!: (value: any) => void;
  mocks.analyze.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await controller.pair(); await controller.activate(); const pending = controller.screenshot();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  controller.deactivate(); finish({ success: true, answer: 'late answer' }); await pending;
  await vi.advanceTimersByTimeAsync(2000);
  expect(mocks.post.mock.calls.some(c => c[1] === 'publishRelayResult' && c[2].card.status === 'done')).toBe(false);
  expect(controller.state().workspace).toBe('pc');
});
test('account change revokes pairing and never falls back to PC shortcuts', async () => {
  const { controller, changeAccount } = fixture(); await controller.pair(); await controller.activate();
  changeAccount(); await controller.sync();
  expect(controller.state()).toMatchObject({ workspace: 'mobile', connected: false, code: undefined });
  await controller.screenshot(); expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.post.mock.calls.some(c => c[1] === 'revokeRelaySession')).toBe(true);
});
test('service endpoint requires HTTPS and cannot change while paired', async () => {
  const { controller } = fixture(); expect(() => controller.setServiceUrl('http://example.test/')).toThrow();
  expect(() => controller.setServiceUrl('https://user:password@example.test/')).toThrow();
  controller.setServiceUrl('https://example.test/reader'); expect(controller.state().serviceUrl).toBe('https://example.test/reader/');
  await controller.pair(); expect(() => controller.setServiceUrl('https://other.example/')).toThrow();
});

test('mobile audio selection persists and restarts only its own running interview', async () => {
  let context = { audioMode: 'demo' }, listening = false;
  const restart = vi.fn(async () => {}), setContext = vi.fn(p => { context = { ...context, ...p }; });
  const controller = new CompanionController({getClientSettings: () => ({})} as any,
    {getContext: () => context, setContext, isListening: () => listening, restart} as any, () => {});
  await controller.setAudioMode('formal'); expect(controller.state().audioMode).toBe('formal');
  expect(restart).not.toHaveBeenCalled(); listening = true;
  await controller.setAudioMode('demo'); expect(restart).toHaveBeenCalledTimes(1);
  expect(controller.state().audioMode).toBe('demo');
  await expect(controller.setAudioMode('invalid')).rejects.toThrow();
});

test('reader offline stops audio while preserving mobile shortcut ownership', async () => {
  let listening = false;
  const stop = vi.fn(() => { listening = false; });
  const controller = new CompanionController({getAuthToken: () => 'desktop-token', getClientSettings: () => ({companionServiceUrl: 'https://test.example/'})} as any,
    {stopForWorkspace: stop, isListening: () => listening, getContext: () => ({})} as any, () => {});
  await controller.pair(); await controller.activate(); listening = true; stop.mockClear();
  mocks.post.mockResolvedValue({connected:false}); await controller.sync();
  expect(stop).toHaveBeenCalledTimes(1); expect(controller.state()).toMatchObject({workspace:'mobile',connected:false,listening:false});
});
