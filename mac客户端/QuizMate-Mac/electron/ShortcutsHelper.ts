// Global shortcuts helper - 完全沿用原考试插件的快捷键方案
import { globalShortcut } from 'electron'
import { defaultShortcutBindings, interviewShortcutActions, ShortcutAction, isConfigurable, normalizeMacAccelerator } from '../shared/shortcuts'
import { ConfigHelper } from './ConfigHelper'

type ActionHandler = (action: ShortcutAction) => void

const voiceModeActions: Set<string> = new Set<string>([
  'search',
  'toggle_visibility',
  'replay',
  'reset',
  'interview_start',
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

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  public init(): void {
    const stored = this.configHelper.getShortcutBindings?.() || {}
    this.bindings = { ...defaultShortcutBindings }
    const migrated: Record<string, string> = {}
    let migrationNeeded = false
    for (const action of Object.keys(defaultShortcutBindings) as ShortcutAction[]) {
      if (action === 'quit') {
        if (stored[action]) migrationNeeded = true
        migrated[action] = ''
        continue
      }
      if (!stored[action]) continue
      const normalized = normalizeMacAccelerator(stored[action])
      // Older Mac builds used Command+Q/Command+W (and one interim build used
      // Alt+Q) for screenshots.  Command+Q is reserved by macOS and
      // Command+W closes the current window, so migrate every legacy value
      // before registering global shortcuts on upgrade.
      const replacement = action === 'screenshot' && ['command+q', 'command+w', 'alt+q'].includes(normalized.toLowerCase())
        ? defaultShortcutBindings.screenshot
        : action === 'search' && ['command+e', 'alt+e'].includes(normalized.toLowerCase())
          ? defaultShortcutBindings.search
          : normalized
      this.bindings[action] = replacement
      migrated[action] = replacement
      if (replacement !== normalized) migrationNeeded = true
      if (normalized !== stored[action]) migrationNeeded = true
    }
    if (migrationNeeded) this.configHelper.setShortcutBindings?.(migrated)
  }

  public setHandler(handler: ActionHandler): void {
    this.handler = handler
  }

  public getBindings(): Record<string, string> {
    return { ...this.bindings }
  }

  public getBinding(action: ShortcutAction): string {
    return this.bindings[action] || defaultShortcutBindings[action]
  }

  public setBinding(action: ShortcutAction, accelerator: string): boolean {
    if (!this.isConfigurable(action)) return false
    const normalized = normalizeMacAccelerator(accelerator)
    for (const [a, acc] of Object.entries(this.bindings)) {
      if (a !== action && acc.toLowerCase() === normalized.toLowerCase()) {
        return false
      }
    }
    this.bindings[action] = normalized
    this.configHelper.setShortcutBindings?.(this.bindings)
    return true
  }

  public resetBinding(action: ShortcutAction): void {
    if (!this.isConfigurable(action)) return
    this.bindings[action] = defaultShortcutBindings[action]
    this.configHelper.setShortcutBindings?.(this.bindings)
  }

  public resetAll(): void {
    this.bindings = { ...defaultShortcutBindings }
    this.configHelper.setShortcutBindings?.({})
  }

  public isConfigurable(action: ShortcutAction): boolean {
    return isConfigurable(action)
  }

  public checkConflict(accelerator: string, excludeAction?: ShortcutAction): ShortcutAction | null {
    const normalized = normalizeMacAccelerator(accelerator)
    for (const [a, acc] of Object.entries(this.bindings)) {
      if (excludeAction && a === excludeAction) continue
      if (acc.toLowerCase() === normalized.toLowerCase()) {
        return a as ShortcutAction
      }
    }
    return null
  }

  public registerGlobalShortcuts(): void {
    this.unregisterAll()
    this.pausedAccelerators.clear()
    for (const [action, accelerator] of Object.entries(this.bindings)) {
      if (!accelerator) continue
      if (action === 'quit') continue
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
          console.warn(`[ShortcutsHelper] Failed to register: ${accelerator} for ${action}`)
        }
      } catch (e) {
        console.warn(`[ShortcutsHelper] Error registering ${accelerator}:`, e)
      }
    }
  }

  public registerGlobalShortcutsForMode(mode: 'overlay' | 'voice' | 'interview'): void {
    this.activeMode = mode
    this.unregisterAll()
    this.pausedAccelerators.clear()
    for (const [action, accelerator] of Object.entries(this.bindings)) {
      if (!accelerator) continue
      if (action === 'quit') continue
      if (mode === 'voice' && !voiceModeActions.has(action)) continue
      if (mode === 'interview' && !interviewShortcutActions.includes(action as ShortcutAction) && !['reset', 'toggle_visibility', 'replay'].includes(action) && !interviewWindowActions.has(action)) continue
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
          console.warn(`[ShortcutsHelper] Failed to register: ${accelerator} for ${action}`)
        }
      } catch (e) {
        console.warn(`[ShortcutsHelper] Error registering ${accelerator}:`, e)
      }
    }
  }

  public refreshCurrentRegistration(): void {
    this.registerGlobalShortcutsForMode(this.activeMode)
  }

  public getActionsForMode(mode: 'overlay' | 'voice' | 'interview'): ShortcutAction[] {
    const all = Object.keys(this.bindings) as ShortcutAction[]
    if (mode === 'overlay') {
      return all.filter(action => !!this.bindings[action])
    }
    if (mode === 'interview') return all.filter(action => !!this.bindings[action] && (interviewShortcutActions.includes(action) || ['reset', 'toggle_visibility', 'replay'].includes(action) || interviewWindowActions.has(action)))
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
