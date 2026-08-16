// Win32 防捕获 / 防检测保护模块（完全沿用原考试插件实现）
// 核心技术: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) + 窗口样式加固
//
// 原理:
//   1. WDA_EXCLUDEFROMCAPTURE (Win10 2004+) — 在 DWM 合成阶段将窗口从所有屏幕捕获中排除
//      屏幕上正常可见, 但任何截屏/录屏/远程桌面/投屏都无法捕获到该窗口内容
//   2. WDA_MONITOR (Win10 1809+) — 降级方案, 仅物理显示器可见, 远程桌面看不到
//   3. WS_EX_TOOLWINDOW — 不在任务栏/Alt+Tab 中显示, 减少 EnumWindows 扫描可见性
//   4. WS_EX_NOACTIVATE — 不抢焦点, 点击不激活窗口, 降低检测风险
//   5. 空标题 — 防止通过 GetWindowText 扫描关键字

import { BrowserWindow } from 'electron'

let koffi: any = null
let user32: any = null
let kernel32: any = null

let _SetWindowDisplayAffinity: ((hwnd: any, affinity: number) => number) | null = null
let _GetWindowLongPtrW: ((hwnd: any, nIndex: number) => any) | null = null
let _SetWindowLongPtrW: ((hwnd: any, nIndex: number, dwNewLong: any) => any) | null = null
let _SetWindowTextW: ((hwnd: any, lpString: string) => number) | null = null
let _GetLastError: (() => number) | null = null
let _IsWindowVisible: ((hwnd: any) => number) | null = null

export const WDA_NONE = 0x00000000
export const WDA_MONITOR = 0x00000001
export const WDA_EXCLUDEFROMCAPTURE = 0x00000011

const GWL_EXSTYLE = -20

export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_NOACTIVATE = 0x08000000
export const WS_EX_TRANSPARENT = 0x00000020
export const WS_EX_LAYERED = 0x00080000
export const WS_EX_TOPMOST = 0x00000008

let _initialized = false

function ensureInitialized(): boolean {
  if (_initialized) return user32 !== null
  _initialized = true

  if (process.platform !== 'win32') {
    return false
  }

  try {
    koffi = require('koffi')
    user32 = koffi.load('user32.dll')
    kernel32 = koffi.load('kernel32.dll')

    _SetWindowDisplayAffinity = user32.func('int __stdcall SetWindowDisplayAffinity(void *hwnd, uint32_t dwAffinity)')
    _GetWindowLongPtrW = user32.func('int64_t __stdcall GetWindowLongPtrW(void *hwnd, int32_t nIndex)')
    _SetWindowLongPtrW = user32.func('int64_t __stdcall SetWindowLongPtrW(void *hwnd, int32_t nIndex, int64_t dwNewLong)')
    _SetWindowTextW = user32.func('int __stdcall SetWindowTextW(void *hwnd, const char16_t *lpString)')
    _GetLastError = kernel32.func('uint32_t __stdcall GetLastError()')
    _IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *hwnd)')
    return true
  } catch (e: any) {
    console.error('[Win32Protection] Failed to initialize:', e)
    return false
  }
}

function getHwnd(win: BrowserWindow): any | null {
  try {
    const buf = win.getNativeWindowHandle()
    if (!buf || buf.length === 0) return null
    if (buf.length >= 8) {
      const hwnd = buf.readBigUInt64LE(0)
      if (hwnd <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(hwnd)
      }
      return hwnd
    } else if (buf.length >= 4) {
      return buf.readUInt32LE(0)
    }
    return null
  } catch (e) {
    console.error('[Win32Protection] getNativeWindowHandle failed:', e)
    return null
  }
}

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

export function setWindowDisplayAffinity(
  win: BrowserWindow,
  affinity: number = WDA_EXCLUDEFROMCAPTURE
): boolean {
  if (!ensureInitialized() || !_SetWindowDisplayAffinity) {
    console.warn('[Win32Protection] setWindowDisplayAffinity not available')
    return false
  }
  const hwnd = getHwnd(win)
  if (!hwnd) return false

  try {
    const ok = _SetWindowDisplayAffinity(hwnd, affinity)
    if (!ok) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] SetWindowDisplayAffinity(0x${affinity.toString(16)}) failed, GetLastError=${err}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[Win32Protection] setWindowDisplayAffinity exception:', e)
    return false
  }
}

function addExtendedStyles(win: BrowserWindow, styleBits: number): boolean {
  if (!ensureInitialized() || !_GetWindowLongPtrW || !_SetWindowLongPtrW) return false
  const hwnd = getHwnd(win)
  if (!hwnd) return false

  try {
    const current = _GetWindowLongPtrW(hwnd, GWL_EXSTYLE)
    if (typeof current !== 'number' || current === 0) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] GetWindowLongPtrW(GWL_EXSTYLE) failed, GetLastError=${err}`)
      return false
    }
    const updated = current | styleBits
    if (updated === current) return true
    const prev = _SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated)
    if (!prev) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] SetWindowLongPtrW failed, GetLastError=${err}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[Win32Protection] addExtendedStyles exception:', e)
    return false
  }
}

export function setEmptyWindowTitle(win: BrowserWindow): boolean {
  if (!ensureInitialized() || !_SetWindowTextW) return false
  const hwnd = getHwnd(win)
  if (!hwnd) return false
  try {
    const ok = _SetWindowTextW(hwnd, '')
    return !!ok
  } catch (e) {
    console.error('[Win32Protection] setEmptyWindowTitle exception:', e)
    return false
  }
}

export function applyAntiCapture(win: BrowserWindow): { excluded: boolean; monitor: boolean } {
  try {
    win.setContentProtection(true)
  } catch (e) {
    console.warn('[Win32Protection] Electron setContentProtection failed:', e)
  }

  const ok = setWindowDisplayAffinity(win, WDA_EXCLUDEFROMCAPTURE)
  if (ok) {
    return { excluded: true, monitor: true }
  }
  const ok2 = setWindowDisplayAffinity(win, WDA_MONITOR)
  return { excluded: false, monitor: ok2 }
}

export function applyStealthStyles(win: BrowserWindow): { toolWindow: boolean; noActivate: boolean } {
  const toolWindow = addExtendedStyles(win, WS_EX_TOOLWINDOW)
  const noActivate = addExtendedStyles(win, WS_EX_NOACTIVATE)
  return { toolWindow, noActivate }
}

export function applyAllProtections(win: BrowserWindow): ProtectionResult {
  if (process.platform !== 'win32') {
    try { win.setContentProtection(true) } catch {}
    return { success: true, details: { captureExcluded: false, captureMonitor: false } }
  }

  const antiCapture = applyAntiCapture(win)
  const stealth = applyStealthStyles(win)
  const emptyTitle = setEmptyWindowTitle(win)

  const success = antiCapture.excluded || antiCapture.monitor
  return {
    success,
    affinity: antiCapture.excluded ? WDA_EXCLUDEFROMCAPTURE : antiCapture.monitor ? WDA_MONITOR : WDA_NONE,
    details: {
      captureExcluded: antiCapture.excluded,
      captureMonitor: antiCapture.monitor,
      toolWindow: stealth.toolWindow,
      noActivate: stealth.noActivate,
      emptyTitle,
    },
  }
}

export function removeAntiCapture(win: BrowserWindow): boolean {
  return setWindowDisplayAffinity(win, WDA_NONE)
}

export function isExcludeFromCaptureSupported(): boolean {
  if (!ensureInitialized() || !_SetWindowDisplayAffinity) return false
  return true
}
