// macOS 防捕获 / 防检测保护模块
//
// 原理:
//   1. setContentProtection(true) - Electron 在 macOS 上映射为 NSWindow.sharingType = NSWindowSharingNone,
//      窗口对所有 CGWindowList 系截图/录屏/投屏路径完全排除:
//      屏幕上正常可见, 但截屏/录屏/共享屏幕时该窗口整体缺席(显示其后方内容), 不产生黑块
//   2. panel 类型 + skipTaskbar - 不出现在 Dock/任务切换器(Command+Tab)
//   3. focusable: false(由窗口创建参数保证) - 不抢焦点
//   4. 空标题 - 防止通过窗口标题扫描关键字
//
// 与 Win32Protection 保持同一接口(protection.ts 按平台分发):
//   - applyAllProtections / applyAntiCapture / startProtectionWatchdog / removeAntiCapture
//   - macOS 无 GetWindowDisplayAffinity 读回机制, 看门狗改为周期性幂等重设(开销极低),
//     防止系统状态切换导致的静默失效
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

/** 与 Windows 端 WDA_EXCLUDEFROMCAPTURE 同语义: 窗口从捕获中完全排除(无黑块) */
const MAC_CAPTURE_EXCLUDED = 0x11

export function applyAntiCapture(win: BrowserWindow): AntiCaptureResult {
  try {
    // NSWindowSharingNone: 窗口对截屏/录屏/共享屏幕整体缺席, 无黑块
    win.setContentProtection(true)
    return { excluded: true, monitor: false, affinity: MAC_CAPTURE_EXCLUDED, verified: true }
  } catch (error) {
    console.warn('[MacProtection] setContentProtection failed:', error)
    return { excluded: false, monitor: false, affinity: 0, verified: false }
  }
}

export function applyAllProtections(win: BrowserWindow): ProtectionResult {
  const antiCapture = applyAntiCapture(win)
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
      noActivate: !win.isFocusable(),
      emptyTitle: true,
    },
  }
}

/**
 * 防捕获看门狗: 周期性幂等重设 setContentProtection。
 * macOS 无 DisplayAffinity 读回机制, 重设开销极低且无副作用;
 * 窗口销毁后自动停止。
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
      // Older Electron versions cannot read back NSWindow.sharingType. Reapply
      // idempotently on every tick so hide/show and display changes cannot leave
      // the overlay unprotected.
      const readBack = (win as unknown as { isContentProtected?: () => boolean }).isContentProtected
      const protectedNow = typeof readBack === 'function' ? readBack.call(win) : false
      if (!protectedNow || typeof readBack !== 'function') {
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
