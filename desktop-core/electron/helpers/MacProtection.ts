// macOS 窗口隐私与输入透明模块
//
// 原理:
//   1. setContentProtection(true) - Electron 在 macOS 上映射为 NSWindow.sharingType = NSWindowSharingNone,
//      请求传统 CGWindowList 系捕获路径排除该窗口:
//      屏幕上正常可见, 但截屏/录屏/共享屏幕时该窗口整体缺席(显示其后方内容), 不产生黑块
//   2. panel 类型 + skipTaskbar - 不出现在 Dock/任务切换器(Command+Tab)
//   3. focusable: false(由窗口创建参数保证) - 不抢焦点
//   4. 鼠标事件始终穿透到底层应用
//
// 与 Win32Protection 保持同一接口(protection.ts 按平台分发):
//   - applyAllProtections / applyAntiCapture / startProtectionWatchdog / removeAntiCapture
//   - 旧版 Electron 没有公开的 macOS 保护状态读取 API; 新版运行时若提供
//     isContentProtected() 则读取验证, 否则看门狗周期性幂等重设。
//
// 说明: macOS 15+ 上使用 ScreenCaptureKit 的新采集工具可能突破 sharingType 保护,
// 属系统级能力边界(Apple 有意变更), 已在用户手册中说明。

import { BrowserWindow } from 'electron'

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

export interface AntiCaptureResult {
  excluded: boolean
  monitor: boolean
  affinity: number
  verified: boolean
}

export interface ProtectionWatchdog {
  stop: () => void
}

/** 仅作跨平台诊断标记；macOS 不提供 Windows display affinity 的等价保证。 */
const MAC_CAPTURE_EXCLUDED = 0x11

function applyInputTransparency(win: BrowserWindow): boolean {
  try {
    win.setFocusable(false)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setSkipTaskbar(true)
    return !win.isFocusable()
  } catch (error) {
    console.warn('[MacProtection] input transparency failed:', error)
    return false
  }
}

export function applyAntiCapture(win: BrowserWindow): AntiCaptureResult {
  try {
    // NSWindowSharingNone: 窗口对常规截屏/录屏/共享屏幕整体缺席, 无黑块。
    win.setContentProtection(true)
    const state = readContentProtection(win)
    return {
      excluded: state !== false,
      monitor: false,
      affinity: MAC_CAPTURE_EXCLUDED,
      verified: state === true,
    }
  } catch (error) {
    console.warn('[MacProtection] setContentProtection failed:', error)
    return { excluded: false, monitor: false, affinity: 0, verified: false }
  }
}

/** Electron 31 does not type this API, while newer Electron runtimes expose it. */
export function readContentProtection(win: BrowserWindow): boolean | null {
  try {
    const readBack = (win as unknown as { isContentProtected?: () => boolean }).isContentProtected
    return typeof readBack === 'function' ? readBack.call(win) : null
  } catch {
    return null
  }
}

export function applyAllProtections(win: BrowserWindow): ProtectionResult {
  const antiCapture = applyAntiCapture(win)
  const noActivate = applyInputTransparency(win)
  let toolWindow = false
  try {
    win.setSkipTaskbar(true)
    toolWindow = true
  } catch {}
  return {
    success: antiCapture.excluded,
    affinity: antiCapture.affinity,
    verified: antiCapture.verified,
    details: {
      captureExcluded: antiCapture.excluded,
      captureMonitor: false,
      toolWindow,
      noActivate,
      emptyTitle: true,
    },
  }
}

/**
 * 防捕获看门狗: 周期性幂等重设 setContentProtection。
 * 旧版 macOS Electron 无公开读回机制时，重设开销极低且无副作用；
 * 新版运行时只有读回为 false/未知时才重设。窗口销毁后自动停止。
 */
export function startProtectionWatchdog(
  win: BrowserWindow,
  opts: { label?: string; intervalMs?: number } = {}
): ProtectionWatchdog {
  if (process.platform !== 'darwin') {
    return { stop: () => {} }
  }
  const label = opts.label || 'overlay'
  const intervalMs = Math.max(opts.intervalMs ?? 2000, 500)
  let reapplyCount = 0
  const timer = setInterval(() => {
    try {
      if (!win || win.isDestroyed()) {
        clearInterval(timer)
        return
      }
      // Mouse pass-through has no public readback API. Reapply it
      // idempotently so window show/move/display changes cannot make the
      // overlay intercept clicks or focus.
      applyInputTransparency(win)
      // Older Electron versions cannot read back NSWindow.sharingType. Reapply
      // idempotently on every tick so hide/show and display changes cannot leave
      // the overlay unprotected.
      const protectedNow = readContentProtection(win)
      if (protectedNow !== true) {
        reapplyCount++
        if (reapplyCount === 1 || reapplyCount % 10 === 0) {
          console.log(`[MacProtection] watchdog(${label}): reapplying content protection (${reapplyCount})`)
        }
        applyAntiCapture(win)
      }
    } catch (e) {
      console.warn(`[MacProtection] watchdog(${label}) error:`, e)
    }
  }, intervalMs)
  return { stop: () => clearInterval(timer) }
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
