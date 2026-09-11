import type { ShortcutAction } from './shortcuts';

export type AssistantWorkspace = 'pc' | 'mobile';
export type ShortcutDestination = 'pc' | 'mobile-exam' | 'mobile-interview' | 'system' | 'ignore';

/** The companion workflow is available in both maintained desktop clients. */
export function supportsCompanionDesktopPlatform(platform: string): boolean {
  return platform === 'win32' || platform === 'darwin';
}

/** Resolve before touching any window, capture queue, or audio session. */
export function routeWorkspaceShortcut(
  workspace: AssistantWorkspace,
  transitioning: boolean,
  action: ShortcutAction,
): ShortcutDestination {
  if (action === 'quit' || action === 'restore_main_window') return 'system';
  if (transitioning) return 'ignore';
  if (workspace === 'pc') return 'pc';
  // Shared global shortcuts are routed to the active workspace. In mobile
  // workspace the three exam actions are deliberately isolated from the PC
  // overlay, while interview start remains a page-button-only operation.
  if (action === 'screenshot' || action === 'search' || action === 'copy_content') return 'mobile-exam';
  return 'ignore';
}

export function workspaceEntryError(route: string, workspace: AssistantWorkspace, exam: boolean, interview: boolean): string {
  // Navigation now owns the lifecycle: entering mobile closes PC helpers and
  // entering a PC page exits mobile. Keep this function as a compatibility
  // seam for older renderers, but never block the requested route.
  return '';
}
