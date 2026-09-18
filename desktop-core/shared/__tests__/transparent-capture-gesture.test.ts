import { describe, expect, it } from 'vitest';
import { shouldTriggerTransparentCapture } from '../transparent-capture-gesture';

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
});
