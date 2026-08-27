import { createRequire } from 'module'

export type MacScreenPermission = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

const requireNative = createRequire(import.meta.url)
let coreGraphics: { preflight: () => boolean; request: () => boolean } | null = null

/** CoreGraphics is lazy-loaded so Windows builds never load a macOS framework. */
function getCoreGraphics(): typeof coreGraphics {
  if (coreGraphics) return coreGraphics
  try {
    const koffi = requireNative('koffi')
    const library = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
    coreGraphics = {
      preflight: library.func('bool CGPreflightScreenCaptureAccess()'),
      request: library.func('bool CGRequestScreenCaptureAccess()'),
    }
  } catch (error) {
    console.warn('[MacCapturePermissions] CoreGraphics bridge unavailable:', error)
    coreGraphics = null
  }
  return coreGraphics
}

export function preflightScreenCaptureAccess(): boolean | null {
  if (process.platform !== 'darwin') return true
  try {
    return getCoreGraphics()?.preflight() ?? null
  } catch (error) {
    console.warn('[MacCapturePermissions] CoreGraphics preflight failed:', error)
    return null
  }
}

export function requestScreenCaptureAccess(): boolean | null {
  if (process.platform !== 'darwin') return true
  try {
    return getCoreGraphics()?.request() ?? null
  } catch (error) {
    console.warn('[MacCapturePermissions] CoreGraphics request failed:', error)
    return null
  }
}

export function getMacScreenPermission(mediaStatus: MacScreenPermission): MacScreenPermission {
  if (process.platform !== 'darwin') return 'granted'
  if (preflightScreenCaptureAccess() === true) return 'granted'
  return mediaStatus
}
