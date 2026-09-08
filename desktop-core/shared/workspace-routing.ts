import type { ShortcutAction } from './shortcuts';

export type AssistantWorkspace = 'pc' | 'mobile';
export type ShortcutDestination = 'pc' | 'mobile-exam' | 'mobile-interview' | 'system' | 'ignore';

/** Resolve before touching any window, capture queue, or audio session. */
export function routeWorkspaceShortcut(
  workspace: AssistantWorkspace,
  transitioning: boolean,
  action: ShortcutAction,
): ShortcutDestination {
  if (action === 'quit' || action === 'restore_main_window') return 'system';
  if (transitioning) return 'ignore';
  if (workspace === 'pc') return 'pc';
  if (action === 'screenshot') return 'mobile-exam';
  if (action === 'interview_start') return 'mobile-interview';
  return 'ignore';
}

export function workspaceEntryError(route: string, workspace: AssistantWorkspace, exam: boolean, interview: boolean): string {
  if (workspace === 'mobile' && (route === '/exam' || route === '/interview')) return '请先关闭双机协作笔面试';
  if (route !== '/companion' || workspace === 'mobile') return '';
  if (exam && interview) return '请关闭PC笔试和面试助手';
  if (exam) return '请先关闭PC笔试助手';
  if (interview) return '请先关闭PC面试助手';
  return '';
}
