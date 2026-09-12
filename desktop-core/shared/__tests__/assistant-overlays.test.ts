import { describe, expect, it } from 'vitest';
import {
  examOverlayShortcutActions,
  examVoiceShortcutActions,
  getDefaultShortcutBindings,
  shouldRegisterShortcutForProcessingMode,
} from '../shortcuts';
import { isCurrentOperation, selectActiveOverlay, selectFreshScreenshot, shouldEnsureExamOverlay } from '../overlay-state';

describe('independent desktop assistants', () => {
  it('uses separate Windows defaults for exam visibility and interview session', () => {
    const shortcuts = getDefaultShortcutBindings('win32');
    expect(shortcuts.toggle_visibility).toBe('Alt+B');
    expect(shortcuts.interview_start).toBe('Alt+R');
    expect(shortcuts.screenshot).toBe('Alt+Q');
    expect(shortcuts.search).toBe('Alt+E');
    expect(shortcuts.voice_search).toBe('Alt+T');
  });

  it('registers exactly one exam search action for the active presentation mode', () => {
    expect(shouldRegisterShortcutForProcessingMode('search', 'overlay')).toBe(true);
    expect(shouldRegisterShortcutForProcessingMode('voice_search', 'overlay')).toBe(false);
    expect(shouldRegisterShortcutForProcessingMode('search', 'voice')).toBe(false);
    expect(shouldRegisterShortcutForProcessingMode('voice_search', 'voice')).toBe(true);
    expect(shouldRegisterShortcutForProcessingMode('interview_start', 'voice')).toBe(true);
  });

  it('shows the matching configurable search action on each exam mode page', () => {
    expect(examOverlayShortcutActions).toContain('search');
    expect(examOverlayShortcutActions).not.toContain('voice_search');
    expect(examVoiceShortcutActions).toContain('voice_search');
    expect(examVoiceShortcutActions).not.toContain('search');
  });

  it('routes adjustments to the last visible overlay and falls back when it closes', () => {
    expect(selectActiveOverlay('interview', { exam: true, interview: true })).toBe('interview');
    expect(selectActiveOverlay('interview', { exam: true, interview: false })).toBe('exam');
    expect(selectActiveOverlay('exam', { exam: false, interview: true })).toBe('interview');
  });

  it('rejects a late result after a new screenshot operation starts', () => {
    expect(isCurrentOperation('new-operation', 'old-operation')).toBe(false);
    expect(isCurrentOperation('new-operation', 'new-operation')).toBe(true);
    expect(isCurrentOperation('new-operation')).toBe(true);
  });

  it('keeps voice capture and search headless while preserving the explicit visibility toggle', () => {
    expect(shouldEnsureExamOverlay('voice', 'search')).toBe(false);
    expect(shouldEnsureExamOverlay('voice', 'screenshot')).toBe(false);
    expect(shouldEnsureExamOverlay('voice', 'toggle_visibility')).toBe(false);
    expect(shouldEnsureExamOverlay('overlay', 'search')).toBe(true);
  });

  it('accepts only a newly captured screenshot for voice search', () => {
    expect(selectFreshScreenshot('old.png', ['old.png'])).toBeNull();
    expect(selectFreshScreenshot('old.png', ['new.png'])).toBe('new.png');
    expect(selectFreshScreenshot(undefined, [])).toBeNull();
  });
});
