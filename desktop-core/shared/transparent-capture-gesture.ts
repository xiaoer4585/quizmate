/** Movement below this threshold is treated as a click when the pointer is released. */
export const TRANSPARENT_CAPTURE_DRAG_THRESHOLD = 6;

export function shouldTriggerTransparentCapture(totalDx: number, totalDy: number): boolean {
  if (!Number.isFinite(totalDx) || !Number.isFinite(totalDy)) return false;
  return Math.hypot(totalDx, totalDy) < TRANSPARENT_CAPTURE_DRAG_THRESHOLD;
}

export type TransparentCaptureCorner = 'nw' | 'ne' | 'sw' | 'se';
export type SquareBounds = { x: number; y: number; width: number; height: number };

export function resizeSquareBounds(bounds: SquareBounds, corner: TransparentCaptureCorner, dx: number, dy: number, minSize: number, maxSize: number): SquareBounds {
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
  const delta = corner === 'se'
    ? (horizontalDominant ? dx : dy)
    : corner === 'nw'
      ? (horizontalDominant ? -dx : -dy)
      : corner === 'ne'
        ? (horizontalDominant ? dx : -dy)
        : (horizontalDominant ? -dx : dy);
  const size = Math.min(maxSize, Math.max(minSize, Math.round(bounds.width + delta)));
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return {
    x: corner === 'nw' || corner === 'sw' ? right - size : bounds.x,
    y: corner === 'nw' || corner === 'ne' ? bottom - size : bounds.y,
    width: size,
    height: size,
  };
}
