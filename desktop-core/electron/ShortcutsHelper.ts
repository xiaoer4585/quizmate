// Global shortcuts helper - 完全沿用原考试插件的快捷键方案
import { globalShortcut } from 'electron'
import { getDefaultShortcutBindings, ShortcutAction, isConfigurable, interviewShortcutActions } from '../shared/shortcuts'
import { ConfigHelper } from './ConfigHelper'

type ActionHandler = (action: ShortcutAction) => void

const voiceModeActions: Set<string> = new Set<string>([
  'search',
  'toggle_visibility',
  'replay',
  'quit',
  'reset',
  'interview_prev_question',
  'interview_next_question',
])

// 面试模式下同样可用的窗口调节动作（与笔试悬浮窗一致：移动/缩放/透明度/界面缩放/复位）。
// 这些动作在 handleShortcutAction 中按 interviewActive 路由到面试悬浮窗，
// 若不加入白名单，interview:activateShortcuts 切换注册模式后快捷键将无法触发。
const interviewWindowActions: Set<string> = new Set<string>([
  'move_up',
  'move_down',
  'move_left',
  'move_right',
  'resize_height_larger',
  'resize_height_smaller',
  'resize_width_smaller',
  'resize_width_larger',
  'opacity_brighter',
  'opacity_darker',
  'opacity_brighter_alt',
  'opacity_darker_alt',
  'zoom_in',
  'zoom_out',
  'zoom_reset',
  'reset_position',
])

export class ShortcutsHelper {
  private configHelper: ConfigHelper
  private bindings: Record<string, string> = {}
  private registered: Set<string> = new Set()
  private pausedAccelerators: Set<string> = new Set()
  private handler: ActionHandler | null = null
  private testMode: boolean = false
  private testCallback: ((accelerator: string) => void) | null = null
  private activeMode: 'overlay' | 'voice' | 'interview' = 'overlay'
  private defaults: Record<ShortcutAction, string> = getDefaultShortcutBindings()
  private registrationErrorHandler: ((data: { action: string; accelerator: string; mode: string }) => void) | null = null

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  public init(): void {
    const stored = this.configHelper.getShortcutBindings?.() || {}
    this.defaults = getDefaultShortcutBindings(process.platform)
    this.bindings = { ...this.defaults }
    for (const action of Object.keys(this.defaults) as ShortcutAction[]) {
      if (stored[action]) this.bindings[action] = stored[action]
    }
    const migrated = { ...stored }
    let changed = false
    if (stored.screenshot?.toLowerCase() === 'ctrl+w') {
      this.bindings.screenshot = this.defaults.screenshot
      migrated.screenshot = this.defaults.screenshot
      changed = true
    }
    if (stored.search?.toLowerCase() === 'ctrl+e') {
      this.bindings.search = this.defaults.search
      migrated.search = this.defaults.search
      changed = true
    }
    if (process.platform === 'darwin') {
      const legacyMac: Record<string, string[]> = {
        screenshot: ['alt+q', 'command+q', 'command+w', 'command+alt+q'],
        search: ['alt+e', 'command+e', 'command+alt+e'],
        interview_start: ['alt+i', 'command+i', 'command+shift+i'],
      }
      for (const [action, values] of Object.entries(legacyMac)) {
        const current = stored[action]?.toLowerCase()
        if (current && values.includes(current)) {
          this.bindings[action] = this.defaults[action as ShortcutAction]
          migrated[action] = this.defaults[action as ShortcutAction]
          changed = true
        }
      }
    }
    if (changed) this.configHelper.setShortcutBindings?.(migrated)
  }

  public setHandler(handler: ActionHandler): void {
    this.handler = handler
  }

  public setRegistrationErrorHandler(handler: (data: { action: string; accelerator: string; mode: string }) => void): void {
    this.registrationErrorHandler = handler
  }

  public getBindings(): Record<string, string> {
    return { ...this.bindings }
  }

  public getBinding(action: ShortcutAction): string {
    return this.bindings[action] || this.defaults[action]
  }

  public setBinding(action: ShortcutAction, accelerator: string): boolean {
    if (!this.isConfigurable(action)) return false
    for (const [a, acc] of Object.entries(this.bindings)) {
      if (a !== action && acc.toLowerCase() === accelerator.toLowerCase()) {
        return false
      }
    }
    this.bindings[action] = accelerator
    this.configHelper.setShortcutBindings?.(this.bindings)
    return true
  }

  public resetBinding(action: ShortcutAction): void {
    if (!this.isConfigurable(action)) return
    this.bindings[action] = this.defaults[action]
    this.configHelper.setShortcutBindings?.(this.bindings)
  }

  public resetAll(): void {
    this.bindings = { ...this.defaults }
    this.configHelper.setShortcutBindings?.({})
  }

  public isConfigurable(action: ShortcutAction): boolean {
    return isConfigurable(action)
  }

  public checkConflict(accelerator: string, excludeAction?: ShortcutAction): ShortcutAction | null {
    for (const [a, acc] of Object.entries(this.bindings)) {
      if (excludeAction && a === excludeAction) continue
      if (acc.toLowerCase() === accelerator.toLowerCase()) {
        return a as ShortcutAction
      }
    }
    return null
  }

  public registerGlobalShortcuts(): void {
    this.registerGlobalShortcutsForMode('overlay')
  }

  private registerAction(action: ShortcutAction, accelerator: string, mode: string): void {
    try {
      const ret = globalShortcut.register(accelerator, () => {
        if (this.testMode && this.testCallback) {
          this.testCallback(accelerator)
          return
        }
        this.handler?.(action)
      })
      if (ret) this.registered.add(accelerator)
      else {
        console.warn(`[ShortcutsHelper] Failed to register: ${accelerator} for ${action}`)
        this.registrationErrorHandler?.({ action, accelerator, mode })
      }
    } catch (e) {
      console.warn(`[ShortcutsHelper] Error registering ${accelerator}:`, e)
      this.registrationErrorHandler?.({ action, accelerator, mode })
    }
  }

  private shouldRegister(action: ShortcutAction, mode: 'overlay' | 'voice' | 'interview'): boolean {
    if (action === 'quit') return false
    if (mode === 'voice') return voiceModeActions.has(action)
    if (mode === 'interview') {
      return interviewShortcutActions.includes(action) || ['reset', 'toggle_visibility', 'replay'].includes(action) || interviewWindowActions.has(action)
    }
    return !interviewShortcutActions.includes(action)
  }

  public registerGlobalShortcutsForMode(mode: 'overlay' | 'voice' | 'interview'): void {
    this.activeMode = mode
    this.unregisterAll()
    this.pausedAccelerators.clear()
    for (const [action, accelerator] of Object.entries(this.bindings)) {
      if (!accelerator) continue
      if (!this.shouldRegister(action as ShortcutAction, mode)) continue
      this.registerAction(action as ShortcutAction, accelerator, mode)
    }
  }

  public refreshCurrentRegistration(): void {
    this.registerGlobalShortcutsForMode(this.activeMode)
  }

  public getActionsForMode(mode: 'overlay' | 'voice' | 'interview'): ShortcutAction[] {
    const all = Object.keys(this.bindings) as ShortcutAction[]
    if (mode === 'overlay') {
      return all.filter(action => !!this.bindings[action] && this.shouldRegister(action, mode))
    }
    if (mode === 'interview') return all.filter(action => !!this.bindings[action] && (interviewShortcutActions.includes(action) || ['quit', 'reset', 'toggle_visibility', 'replay'].includes(action) || interviewWindowActions.has(action)))
    return all.filter(action => !!this.bindings[action] && voiceModeActions.has(action))
  }

  public unregisterAll(): void {
    try {
      globalShortcut.unregisterAll()
    } catch {}
    this.registered.clear()
  }

  // 暂存当前所有已注册的快捷键，然后全部注销（用于快捷键捕获时释放 OS 级拦截）
  public pauseAll(): void {
    if (this.pausedAccelerators.size > 0) return // 已经处于暂停状态
    this.pausedAccelerators = new Set(this.registered)
    this.unregisterAll()
  }

  // 重新注册之前暂存的快捷键
  public resumeAll(): void {
    if (this.pausedAccelerators.size === 0) return
    for (const [action, accelerator] of Object.entries(this.bindings)) {
      if (!this.pausedAccelerators.has(accelerator)) continue
      try {
        const ret = globalShortcut.register(accelerator, () => {
          if (this.testMode && this.testCallback) {
            this.testCallback(accelerator)
            return
          }
          if (this.handler) {
            this.handler(action as ShortcutAction)
          }
        })
        if (ret) {
          this.registered.add(accelerator)
        } else {
          console.warn(`[ShortcutsHelper] Failed to re-register: ${accelerator} for ${action}`)
        }
      } catch (e) {
        console.warn(`[ShortcutsHelper] Error re-registering ${accelerator}:`, e)
      }
    }
    this.pausedAccelerators.clear()
  }

  public startShortcutTest(callback: (accelerator: string) => void): void {
    this.testMode = true
    this.testCallback = callback
  }

  public cancelShortcutTest(): void {
    this.testMode = false
    this.testCallback = null
  }

  public isTestMode(): boolean {
    return this.testMode
  }
}
