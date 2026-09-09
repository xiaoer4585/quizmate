import { describe, it, expect } from 'vitest';
import { routeWorkspaceShortcut, workspaceEntryError } from '../workspace-routing';
import { getDefaultShortcutBindings, type ShortcutAction } from '../shortcuts';

describe('exclusive PC and mobile shortcut ownership', () => {
  it('allows navigation and lets the main process switch workspaces', () => {
    expect(workspaceEntryError('/companion','pc',true,false)).toBe('');
    expect(workspaceEntryError('/companion','pc',false,true)).toBe('');
    expect(workspaceEntryError('/companion','pc',true,true)).toBe('');
    for(const route of ['/exam','/interview']) {
      expect(workspaceEntryError(route,'mobile',false,false)).toBe('');
      expect(workspaceEntryError(route,'pc',true,true)).toBe('');
    }
    expect(workspaceEntryError('/companion','pc',false,false)).toBe('');
  });
  const actions = Object.keys(getDefaultShortcutBindings('win32')) as ShortcutAction[];
  it('preserves every existing PC action', () => {
    for (const action of actions) {
      expect(routeWorkspaceShortcut('pc', false, action)).toBe(
        ['quit', 'restore_main_window'].includes(action) ? 'system' : 'pc',
      );
    }
  });
  it('routes only mobile exam shortcuts in the mobile workspace', () => {
    expect(routeWorkspaceShortcut('mobile', false, 'screenshot')).toBe('mobile-exam');
    expect(routeWorkspaceShortcut('mobile', false, 'search')).toBe('mobile-exam');
    expect(routeWorkspaceShortcut('mobile', false, 'copy_content')).toBe('mobile-exam');
    expect(routeWorkspaceShortcut('mobile', false, 'interview_start')).toBe('ignore');
    for (const action of actions.filter(a => !['screenshot', 'search', 'copy_content', 'interview_start', 'quit', 'restore_main_window'].includes(a))) {
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
