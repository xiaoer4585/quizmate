import { describe, expect, it } from 'vitest';
import { resizeSquareBounds, shouldTriggerTransparentCapture } from '../transparent-capture-gesture';

describe('transparent capture gesture', () => {
  it('treats a short release as one click', () => {
    expect(shouldTriggerTransparentCapture(0, 0)).toBe(true);
    expect(shouldTriggerTransparentCapture(3, 0)).toBe(true);
    expect(shouldTriggerTransparentCapture(5, 5)).toBe(false);
  });

  it('does not trigger after a drag threshold is reached', () => {
    expect(shouldTriggerTransparentCapture(6, 0)).toBe(false);
    expect(shouldTriggerTransparentCapture(-10, 0)).toBe(false);
    expect(shouldTriggerTransparentCapture(Number.NaN, 0)).toBe(false);
  });

  it.each([
    ['se', 20, 0, 120, 10, 20],
    ['nw', -20, 0, 120, -10, 0],
    ['ne', 20, 0, 120, 10, 0],
    ['sw', -20, 0, 120, -10, 20],
  ] as const)('resizes %s from the expected fixed corner', (corner, dx, dy, size, x, y) => {
    expect(resizeSquareBounds({ x: 10, y: 20, width: 100, height: 100 }, corner, dx, dy, 32, 320)).toEqual({ x, y, width: size, height: size });
  });

  it('keeps resize output square and within size limits', () => {
    expect(resizeSquareBounds({ x: 10, y: 20, width: 100, height: 100 }, 'se', -500, 0, 32, 320)).toEqual({ x: 10, y: 20, width: 32, height: 32 });
    expect(resizeSquareBounds({ x: 10, y: 20, width: 100, height: 100 }, 'se', 500, 0, 32, 320)).toEqual({ x: 10, y: 20, width: 320, height: 320 });
  });
});
