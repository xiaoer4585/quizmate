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
