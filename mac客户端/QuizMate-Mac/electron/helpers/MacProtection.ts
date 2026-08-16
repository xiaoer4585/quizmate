import { BrowserWindow } from 'electron'

export interface ProtectionResult {
  success: boolean
  affinity?: number
  error?: string
  details?: {
    captureExcluded?: boolean
    captureMonitor?: boolean
    toolWindow?: boolean
    noActivate?: boolean
    emptyTitle?: boolean
  }
}

export function applyAntiCapture(win: BrowserWindow): { excluded: boolean; monitor: boolean } {
  try {
    // On macOS Electron maps this to NSWindowSharingNone.
    win.setContentProtection(true)
    return { excluded: true, monitor: true }
  } catch (error) {
    console.warn('[MacProtection] setContentProtection failed:', error)
    return { excluded: false, monitor: false }
  }
}

export function applyAllProtections(win: BrowserWindow): ProtectionResult {
  const antiCapture = applyAntiCapture(win)
  try {
    win.setSkipTaskbar(true)
  } catch {}

  return {
    success: antiCapture.excluded,
    details: {
      captureExcluded: antiCapture.excluded,
      captureMonitor: antiCapture.monitor,
      toolWindow: true,
      noActivate: !win.isFocusable(),
      emptyTitle: true,
    },
  }
}

export function removeAntiCapture(win: BrowserWindow): boolean {
  try {
    win.setContentProtection(false)
    return true
  } catch {
    return false
  }
}

export function isExcludeFromCaptureSupported(): boolean {
  return process.platform === 'darwin'
}
