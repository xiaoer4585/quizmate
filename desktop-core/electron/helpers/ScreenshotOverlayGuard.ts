export type ScreenshotOverlayKind = 'exam' | 'interview';

export interface ScreenshotWindowLike {
  isDestroyed(): boolean;
  isVisible(): boolean;
  getOpacity(): number;
  setOpacity(value: number): void;
  hide(): void;
  setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void;
}

export interface ScreenshotOverlaySnapshot {
  kind: ScreenshotOverlayKind;
  window: ScreenshotWindowLike | null;
  wasVisible: boolean;
  opacity: number;
}

export function snapshotScreenshotOverlay(kind: ScreenshotOverlayKind, window: ScreenshotWindowLike | null): ScreenshotOverlaySnapshot {
  if (!window || window.isDestroyed()) return { kind, window: null, wasVisible: false, opacity: 0 };
  let opacity = 1;
  try { opacity = window.getOpacity(); } catch { opacity = 1; }
  let wasVisible = false;
  try { wasVisible = window.isVisible(); } catch { /* destroyed between checks */ }
  return { kind, window, wasVisible, opacity };
}

export function hideScreenshotOverlay(snapshot: ScreenshotOverlaySnapshot): void {
  const window = snapshot.window;
  if (!window || window.isDestroyed()) return;
  try {
    window.setOpacity(0);
    window.hide();
    window.setIgnoreMouseEvents(true, { forward: true });
  } catch {
    // The main process may destroy a window while capture is starting.
  }
}

export async function waitForScreenshotOverlaysHidden(
  snapshots: ScreenshotOverlaySnapshot[],
  timeoutMs = 750,
  pollMs = 16,
): Promise<boolean> {
  const isHidden = ({ window }: ScreenshotOverlaySnapshot): boolean => {
    if (!window || window.isDestroyed()) return true;
    try { return !window.isVisible() && window.getOpacity() <= 0.001; } catch { return true; }
  };
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (snapshots.every(isHidden)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return snapshots.every(isHidden);
}
