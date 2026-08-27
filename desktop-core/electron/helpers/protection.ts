// 防捕获 / 防检测保护 - 平台分发器
// Windows -> Win32Protection (SetWindowDisplayAffinity + koffi 读回验证)
// macOS   -> MacProtection (NSWindowSharingNone)
// 两个实现保持同一函数签名, 悬浮窗/主流程代码无需感知平台差异。
import { BrowserWindow } from 'electron'
import * as Win32 from './Win32Protection'
import * as Mac from './MacProtection'

export type { ProtectionResult, ProtectionWatchdog } from './Win32Protection'
export type { AntiCaptureResult } from './Win32Protection'

const impl = process.platform === 'darwin' ? Mac : Win32

export const applyAllProtections: (win: BrowserWindow) => Win32.ProtectionResult = impl.applyAllProtections
export const applyAntiCapture: (win: BrowserWindow) => Win32.AntiCaptureResult = impl.applyAntiCapture
export const readContentProtection: (win: BrowserWindow) => boolean | null =
  process.platform === 'darwin' ? Mac.readContentProtection : (() => null)
export const startProtectionWatchdog: (
  win: BrowserWindow,
  opts?: { label?: string; intervalMs?: number }
) => Win32.ProtectionWatchdog = impl.startProtectionWatchdog
export const removeAntiCapture: (win: BrowserWindow) => boolean = impl.removeAntiCapture
export const isExcludeFromCaptureSupported: () => boolean = impl.isExcludeFromCaptureSupported
