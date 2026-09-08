import { describe, it, expect } from 'vitest';
import { routeWorkspaceShortcut, workspaceEntryError } from '../workspace-routing';
import { getDefaultShortcutBindings, type ShortcutAction } from '../shortcuts';

describe('exclusive PC and mobile shortcut ownership', () => {
  it('blocks entry with exact messages and preserves PC-to-PC navigation', () => {
    expect(workspaceEntryError('/companion','pc',true,false)).toBe('请先关闭PC笔试助手');
    expect(workspaceEntryError('/companion','pc',false,true)).toBe('请先关闭PC面试助手');
    expect(workspaceEntryError('/companion','pc',true,true)).toBe('请关闭PC笔试和面试助手');
    for(const route of ['/exam','/interview']) {
      expect(workspaceEntryError(route,'mobile',false,false)).toBe('请先关闭双机协作笔面试');
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
