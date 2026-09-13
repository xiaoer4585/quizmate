import { describe, expect, it, vi } from 'vitest';
import {
  hideScreenshotOverlay,
  snapshotScreenshotOverlay,
  waitForScreenshotOverlaysHidden,
  type ScreenshotWindowLike,
} from '../../electron/helpers/ScreenshotOverlayGuard';

function fakeWindow(initialVisible = true, initialOpacity = 1): ScreenshotWindowLike & { visible: boolean; opacity: number } {
  const window = {
    visible: initialVisible,
    opacity: initialOpacity,
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => window.visible),
    getOpacity: vi.fn(() => window.opacity),
    setOpacity: vi.fn((value: number) => { window.opacity = value; }),
    hide: vi.fn(() => { window.visible = false; }),
    setIgnoreMouseEvents: vi.fn(),
  };
  return window;
}

describe('screenshot overlay guard', () => {
  it('captures and hides the actual visible state without activating the other overlay', () => {
    const exam = fakeWindow(true, 0.7);
    const snapshot = snapshotScreenshotOverlay('exam', exam);
    hideScreenshotOverlay(snapshot);
    expect(snapshot.wasVisible).toBe(true);
    expect(snapshot.opacity).toBe(0.7);
    expect(exam.visible).toBe(false);
    expect(exam.opacity).toBe(0);
    expect(exam.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  it('waits for a delayed native hide and treats destroyed windows as hidden', async () => {
    vi.useFakeTimers();
    const window = fakeWindow(true, 1);
    const snapshot = snapshotScreenshotOverlay('interview', window);
    const pending = waitForScreenshotOverlaysHidden([snapshot], 100, 10);
    window.visible = false;
    window.opacity = 0;
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('returns false when a live window cannot be hidden before the deadline', async () => {
    const window = fakeWindow(true, 1);
    const snapshot = snapshotScreenshotOverlay('exam', window);
    await expect(waitForScreenshotOverlaysHidden([snapshot], 1, 1)).resolves.toBe(false);
  });
});
