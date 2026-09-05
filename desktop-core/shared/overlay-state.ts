export type DesktopOverlayKind = 'exam' | 'interview';
export type ExamOverlayTrigger = 'screenshot' | 'search' | 'toggle_visibility';

/** Voice capture/search works headlessly; voice mode never starts the exam overlay. */
export function shouldEnsureExamOverlay(mode: string, _trigger: ExamOverlayTrigger): boolean {
  return mode !== 'voice';
}

/** Voice search must never fall back to the screenshot that existed before this trigger. */
export function selectFreshScreenshot(previousLatest: string | undefined, queue: string[]): string | null {
  const latest = queue[queue.length - 1];
  return latest && latest !== previousLatest ? latest : null;
}

export function selectActiveOverlay(
  lastActive: DesktopOverlayKind,
  visible: Record<DesktopOverlayKind, boolean>,
): DesktopOverlayKind {
  if (visible[lastActive]) return lastActive;
  if (visible.interview) return 'interview';
  return 'exam';
}

export function isCurrentOperation(activeOperationId: string | null, incomingOperationId?: string): boolean {
  return !incomingOperationId || incomingOperationId === activeOperationId;
}
