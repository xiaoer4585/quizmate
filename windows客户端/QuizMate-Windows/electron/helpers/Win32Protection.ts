// Win32 防捕获 / 防检测保护模块
// 核心技术: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) + 窗口样式加固 + 亲和性读回验证与看门狗
//
// 原理:
//   1. WDA_EXCLUDEFROMCAPTURE (Win10 2004+ / build 19041) - 在 DWM 合成阶段将窗口从所有屏幕捕获中排除
//      屏幕上正常可见, 但任何截屏/录屏/远程桌面/投屏都无法捕获到该窗口内容, 且不产生黑块
//   2. WDA_MONITOR (Win10 1809+) - 降级方案: 老系统唯一可用的防捕获手段, 内容不会泄露
//      (部分采集工具下会渲染为黑块, 但仅在 Win10 2004 以下的老系统才会走到该降级分支;
//       该限制为系统能力边界, 已在用户手册中说明, 不做进一步修复)
//   3. WS_EX_TOOLWINDOW - 不在任务栏/Alt+Tab 中显示, 减少 EnumWindows 扫描可见性
//   4. WS_EX_NOACTIVATE - 不抢焦点, 点击不激活窗口, 降低检测风险
//   5. 空标题 - 防止通过 GetWindowText 扫描关键字
//
// 2026.8.26 修复要点(相对 8.25, ia32/32 位系统兼容):
//   - 修复 32 位安装包(ia32)上 koffi 初始化必然失败、导致保护被降级为 WDA_MONITOR(黑块)的问题:
//     * GetWindowLongPtrW/SetWindowLongPtrW 只导出于 64 位 user32.dll; 32 位进程(ia32 包,
//       无论跑在 x64 还是 x86 系统上)必须改用 GetWindowLongW/SetWindowLongW
//     * 8.25 版因此抛符号解析异常 -> 系统 build 号解析被跳过(_windowsBuild=0) -> 目标亲和性
//       被误判为 WDA_MONITOR -> 反而把 setContentProtection 已设好的 EXCLUDEFROMCAPTURE
//       降级回"黑块"模式
//     * 系统 build 号解析提前并独立 try; 每个 FFI 符号独立声明、独立降级, 单个符号缺失
//       只损失对应能力, 不再拖垮整条保护链
//     * ensureInitialized 失败后不再因 user32 已加载而对后续调用误报成功
//
// 实测结论(Win11 26200 / Electron 31, 2026-08-25):
//   - GDI 截图(App自身截图/微信/QQ等)与 WebRTC/DXGI 共享屏幕对 0x11 窗口均完全排除且无黑块
//   - Electron 31 的 setContentProtection(true) 在 Windows 上即设置 WDA_EXCLUDEFROMCAPTURE
//     (Electron 35+ 才改为 WDA_MONITOR, 见 electron#45990), 此处仍显式调用 koffi 双保险

import { BrowserWindow } from 'electron'

let koffi: any = null
let user32: any = null
let kernel32: any = null

let _SetWindowDisplayAffinity: ((hwnd: any, affinity: number) => number) | null = null
let _GetWindowDisplayAffinity: ((hwnd: any, dwAffinity: any) => number) | null = null
let _GetWindowLongW: ((hwnd: any, nIndex: number) => any) | null = null
let _SetWindowLongW: ((hwnd: any, nIndex: number, dwNewLong: any) => any) | null = null
let _SetWindowTextW: ((hwnd: any, lpString: string) => number) | null = null
let _GetLastError: (() => number) | null = null
let _IsWindowVisible: ((hwnd: any) => number) | null = null

export const WDA_NONE = 0x00000000
export const WDA_MONITOR = 0x00000001
export const WDA_EXCLUDEFROMCAPTURE = 0x00000011

/** WDA_EXCLUDEFROMCAPTURE 首次出现的系统版本: Win10 2004 (build 19041) */
const MIN_BUILD_EXCLUDE_FROM_CAPTURE = 19041

const GWL_EXSTYLE = -20

export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_NOACTIVATE = 0x08000000
export const WS_EX_TRANSPARENT = 0x00000020
export const WS_EX_LAYERED = 0x00080000
export const WS_EX_TOPMOST = 0x00000008

let _initialized = false
let _initOk = false
let _windowsBuild = 0

/** 声明单个 FFI 符号; 失败只降级对应能力并记录日志, 不影响其余符号 */
function declareSymbol(name: string, declare: () => void): void {
  try {
    declare()
  } catch (e: any) {
    console.warn(`[Win32Protection] FFI 符号声明失败(该能力降级): ${name}:`, e?.message || e)
  }
}

function ensureInitialized(): boolean {
  if (_initialized) return _initOk
  _initialized = true

  if (process.platform !== 'win32') {
    return false
  }

  // 0) 解析系统 build 号(如 "10.0.26200.0" -> 26200), 用于判断 EXCLUDEFROMCAPTURE 支持性。
  //    必须最先独立完成: 后续任何 FFI 声明失败都不能把版本判定拖垮(否则目标亲和性会被误判)。
  try {
    const ver = String(process.getSystemVersion?.() || '')
    const parts = ver.split('.')
    _windowsBuild = parseInt(parts[2] || '0', 10) || 0
  } catch {
    _windowsBuild = 0
  }

  try {
    koffi = require('koffi')
  } catch (e: any) {
    console.error('[Win32Protection] Failed to load koffi:', e)
    return false
  }

  try {
    user32 = koffi.load('user32.dll')
  } catch (e: any) {
    console.error('[Win32Protection] Failed to load user32.dll:', e)
    return false
  }
  try {
    kernel32 = koffi.load('kernel32.dll')
  } catch (e: any) {
    console.warn('[Win32Protection] Failed to load kernel32.dll(GetLastError 将不可用):', e)
  }

  // 1) 防捕获核心能力(必需)
  declareSymbol('SetWindowDisplayAffinity', () => {
    _SetWindowDisplayAffinity = user32.func('int __stdcall SetWindowDisplayAffinity(void *hwnd, uint32_t dwAffinity)')
  })
  declareSymbol('GetWindowDisplayAffinity', () => {
    _GetWindowDisplayAffinity = user32.func('int __stdcall GetWindowDisplayAffinity(void *hwnd, void *dwAffinity)')
  })

  // 2) 窗口样式加固能力(可选)。
  //    GetWindowLongPtrW/SetWindowLongPtrW 只导出于 64 位 user32.dll; ia32 进程必须使用
  //    GetWindowLongW/SetWindowLongW, 否则 koffi 声明阶段即抛 "Cannot find function" 异常。
  const is64BitProcess = process.arch !== 'ia32'
  let styleApiName = 'unavailable'
  if (is64BitProcess) {
    declareSymbol('GetWindowLongPtrW', () => {
      _GetWindowLongW = user32.func('int64_t __stdcall GetWindowLongPtrW(void *hwnd, int32_t nIndex)')
    })
    declareSymbol('SetWindowLongPtrW', () => {
      _SetWindowLongW = user32.func('int64_t __stdcall SetWindowLongPtrW(void *hwnd, int32_t nIndex, int64_t dwNewLong)')
    })
    if (_GetWindowLongW) styleApiName = 'GetWindowLongPtrW'
  } else {
    declareSymbol('GetWindowLongW', () => {
      _GetWindowLongW = user32.func('int32_t __stdcall GetWindowLongW(void *hwnd, int32_t nIndex)')
    })
    declareSymbol('SetWindowLongW', () => {
      _SetWindowLongW = user32.func('int32_t __stdcall SetWindowLongW(void *hwnd, int32_t nIndex, int32_t dwNewLong)')
    })
    if (_GetWindowLongW) styleApiName = 'GetWindowLongW'
  }

  // 3) 其他辅助能力(可选)
  declareSymbol('SetWindowTextW', () => {
    _SetWindowTextW = user32.func('int __stdcall SetWindowTextW(void *hwnd, const char16_t *lpString)')
  })
  if (kernel32) {
    declareSymbol('GetLastError', () => {
      _GetLastError = kernel32.func('uint32_t __stdcall GetLastError()')
    })
  }
  declareSymbol('IsWindowVisible', () => {
    _IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *hwnd)')
  })

  _initOk = _SetWindowDisplayAffinity !== null && _GetWindowDisplayAffinity !== null
  console.log(
    `[Win32Protection] initialized ok=${_initOk}, arch=${process.arch}, windows build=${_windowsBuild}, ` +
    `excludeFromCapture=${_windowsBuild >= MIN_BUILD_EXCLUDE_FROM_CAPTURE}, styleApi=${styleApiName}`
  )
  return _initOk
}

/** 当前系统是否支持 WDA_EXCLUDEFROMCAPTURE (Win10 2004+) */
export function supportsExcludeFromCapture(): boolean {
  if (process.platform !== 'win32') return false
  ensureInitialized()
  return _windowsBuild >= MIN_BUILD_EXCLUDE_FROM_CAPTURE
}

/** 当前系统的目标防捕获亲和性: 优先 EXCLUDEFROMCAPTURE, 老系统降级 MONITOR */
export function getTargetAffinity(): number {
  return supportsExcludeFromCapture() ? WDA_EXCLUDEFROMCAPTURE : WDA_MONITOR
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

function hex(v: number | null | undefined): string {
  return v === null || v === undefined ? 'unknown' : '0x' + v.toString(16)
}

export interface ProtectionResult {
  success: boolean
  affinity?: number
  verified?: boolean
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

/** 读回窗口当前实际生效的 DisplayAffinity; 失败返回 null */
export function getWindowDisplayAffinity(win: BrowserWindow): number | null {
  if (!ensureInitialized() || !_GetWindowDisplayAffinity) return null
  const hwnd = getHwnd(win)
  if (!hwnd) return null
  try {
    const out = Buffer.alloc(4)
    if (!_GetWindowDisplayAffinity(hwnd, out)) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] GetWindowDisplayAffinity failed, GetLastError=${err}`)
      return null
    }
    return out.readUInt32LE(0)
  } catch (e) {
    console.error('[Win32Protection] getWindowDisplayAffinity exception:', e)
    return null
  }
}

function addExtendedStyles(win: BrowserWindow, styleBits: number): boolean {
  if (!ensureInitialized() || !_GetWindowLongW || !_SetWindowLongW) return false
  const hwnd = getHwnd(win)
  if (!hwnd) return false

  try {
    const current = _GetWindowLongW(hwnd, GWL_EXSTYLE)
    if (typeof current !== 'number' || current === 0) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] GetWindowLong(GWL_EXSTYLE) failed, GetLastError=${err}`)
      return false
    }
    const updated = current | styleBits
    if (updated === current) return true
    const prev = _SetWindowLongW(hwnd, GWL_EXSTYLE, updated)
    if (!prev) {
      const err = _GetLastError ? _GetLastError() : 0
      console.warn(`[Win32Protection] SetWindowLong(GWL_EXSTYLE) failed, GetLastError=${err}`)
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

export interface AntiCaptureResult {
  excluded: boolean
  monitor: boolean
  affinity: number
  verified: boolean
}

/**
 * 应用防捕获保护并读回验证。
 * - Win10 2004+: 目标 WDA_EXCLUDEFROMCAPTURE(内容不可见且无黑块), 失败则降级 MONITOR
 * - Win10 2004 以下: 直接 WDA_MONITOR(该系统唯一可用的内容保护, 部分采集工具下可能显示黑块,
 *   系统能力限制, 已在用户手册说明)
 */
export function applyAntiCapture(win: BrowserWindow): AntiCaptureResult {
  const target = getTargetAffinity()

  // 1) Electron 原生内容保护(Electron 31 在 Windows 上即 EXCLUDEFROMCAPTURE, 与 koffi 双保险)
  try {
    win.setContentProtection(true)
  } catch (e) {
    console.warn('[Win32Protection] Electron setContentProtection failed:', e)
  }

  // 2) koffi 显式设置目标亲和性
  setWindowDisplayAffinity(win, target)

  // 3) 读回验证, 不符则重试一次
  let actual = getWindowDisplayAffinity(win)
  if (actual !== target) {
    console.warn(`[Win32Protection] readback mismatch after first apply: ${hex(actual)} != ${hex(target)}, retrying`)
    setWindowDisplayAffinity(win, target)
    actual = getWindowDisplayAffinity(win)
  }

  // 4) Win10 2004+ 上若 EXCLUDEFROMCAPTURE 始终无法生效, 降级 MONITOR 兜底(内容仍不泄露)
  if (actual !== target && target === WDA_EXCLUDEFROMCAPTURE) {
    console.warn('[Win32Protection] EXCLUDEFROMCAPTURE not effective, falling back to WDA_MONITOR')
    setWindowDisplayAffinity(win, WDA_MONITOR)
    actual = getWindowDisplayAffinity(win)
  }

  const result: AntiCaptureResult = {
    excluded: actual === WDA_EXCLUDEFROMCAPTURE,
    monitor: actual === WDA_MONITOR,
    affinity: actual ?? WDA_NONE,
    verified: actual !== null && (actual === target || actual === WDA_MONITOR),
  }
  if (!result.verified) {
    console.error(`[Win32Protection] anti-capture NOT verified! actual=${hex(actual)} target=${hex(target)}`)
  } else {
    console.log(`[Win32Protection] anti-capture verified: ${hex(actual)} (target=${hex(target)})`)
  }
  return result
}

export function applyStealthStyles(win: BrowserWindow): { toolWindow: boolean; noActivate: boolean } {
  const toolWindow = addExtendedStyles(win, WS_EX_TOOLWINDOW)
  const noActivate = addExtendedStyles(win, WS_EX_NOACTIVATE)
  return { toolWindow, noActivate }
}

export function applyAllProtections(win: BrowserWindow): ProtectionResult {
  if (process.platform !== 'win32') {
    try { win.setContentProtection(true) } catch {}
    return { success: true, verified: false, details: { captureExcluded: false, captureMonitor: false } }
  }

  const antiCapture = applyAntiCapture(win)
  const stealth = applyStealthStyles(win)
  const emptyTitle = setEmptyWindowTitle(win)

  const success = antiCapture.excluded || antiCapture.monitor
  return {
    success,
    affinity: antiCapture.affinity,
    verified: antiCapture.verified,
    details: {
      captureExcluded: antiCapture.excluded,
      captureMonitor: antiCapture.monitor,
      toolWindow: stealth.toolWindow,
      noActivate: stealth.noActivate,
      emptyTitle,
    },
  }
}

export interface ProtectionWatchdog {
  stop: () => void
}

/**
 * 亲和性看门狗: 周期性读回窗口 DisplayAffinity, 发现偏离目标值立即重新应用。
 * 防止 DWM / 系统状态切换 / Electron 内部行为导致的静默失效。
 * 窗口销毁后自动停止。
 */
export function startProtectionWatchdog(
  win: BrowserWindow,
  opts: { label?: string; intervalMs?: number } = {}
): ProtectionWatchdog {
  if (process.platform !== 'win32') {
    return { stop: () => {} }
  }
  const label = opts.label || 'overlay'
  const intervalMs = Math.max(opts.intervalMs ?? 2000, 500)
  let driftCount = 0
  const timer = setInterval(() => {
    try {
      if (!win || win.isDestroyed()) {
        clearInterval(timer)
        return
      }
      const target = getTargetAffinity()
      const actual = getWindowDisplayAffinity(win)
      if (actual === null) return // FFI 不可用, 静默跳过
      if (actual !== target) {
        driftCount++
        console.warn(
          `[Win32Protection] watchdog(${label}): affinity 漂移 ${hex(actual)} != ${hex(target)} (第 ${driftCount} 次), 重新应用`
        )
        applyAntiCapture(win)
        const after = getWindowDisplayAffinity(win)
        if (after !== target) {
          console.error(`[Win32Protection] watchdog(${label}): 重新应用后仍为 ${hex(after)}`)
        } else {
          console.log(`[Win32Protection] watchdog(${label}): 已恢复 ${hex(after)}`)
        }
      }
    } catch (e) {
      console.warn(`[Win32Protection] watchdog(${label}) error:`, e)
    }
  }, intervalMs)
  return {
    stop: () => clearInterval(timer),
  }
}

export function removeAntiCapture(win: BrowserWindow): boolean {
  return setWindowDisplayAffinity(win, WDA_NONE)
}

export function isExcludeFromCaptureSupported(): boolean {
  return supportsExcludeFromCapture()
}
