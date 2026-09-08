import { describe, it, expect } from 'vitest';
import { routeWorkspaceShortcut } from '../workspace-routing';
import { getDefaultShortcutBindings, type ShortcutAction } from '../shortcuts';

describe('exclusive PC and mobile shortcut ownership', () => {
  const actions = Object.keys(getDefaultShortcutBindings('win32')) as ShortcutAction[];
  it('preserves every existing PC action', () => {
    for (const action of actions) {
      expect(routeWorkspaceShortcut('pc', false, action)).toBe(
        ['quit', 'restore_main_window'].includes(action) ? 'system' : 'pc',
      );
    }
  });
  it('allows screenshot and interview together in the mobile workspace', () => {
    expect(routeWorkspaceShortcut('mobile', false, 'screenshot')).toBe('mobile-exam');
    expect(routeWorkspaceShortcut('mobile', false, 'interview_start')).toBe('mobile-interview');
    for (const action of actions.filter(a => !['screenshot', 'interview_start', 'quit', 'restore_main_window'].includes(a))) {
      expect(routeWorkspaceShortcut('mobile', false, action)).toBe('ignore');
    }
  });
  it('blocks assistant actions during either transition', () => {
    for (const workspace of ['pc', 'mobile'] as const) {
      for (const action of actions) {
        expect(routeWorkspaceShortcut(workspace, true, action)).toBe(
          ['quit', 'restore_main_window'].includes(action) ? 'system' : 'ignore',
        );
      }
    }
  });
});
