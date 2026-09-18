/** Movement below this threshold is treated as a click when the pointer is released. */
export const TRANSPARENT_CAPTURE_DRAG_THRESHOLD = 6;

export function shouldTriggerTransparentCapture(totalDx: number, totalDy: number): boolean {
  if (!Number.isFinite(totalDx) || !Number.isFinite(totalDy)) return false;
  return Math.hypot(totalDx, totalDy) < TRANSPARENT_CAPTURE_DRAG_THRESHOLD;
}
