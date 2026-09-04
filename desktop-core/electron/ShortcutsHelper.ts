// Global shortcuts helper - 完全沿用原考试插件的快捷键方案
import { globalShortcut } from 'electron'
import {
  getDefaultShortcutBindings,
  isConfigurable,
  normalizeMacAccelerator,
  ShortcutConflict,
  ShortcutAction,
  toElectronAccelerator,
  validateShortcutConflict,
} from '../shared/shortcuts'
import { ConfigHelper } from './ConfigHelper'

type ActionHandler = (action: ShortcutAction) => void

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
  private registrationErrors: Array<{ action: string; accelerator: string; mode: string }> = []

  constructor(configHelper: ConfigHelper) {
    this.configHelper = configHelper
  }

  public init(): void {
    const stored = this.configHelper.getShortcutBindings?.() || {}
    this.defaults = getDefaultShortcutBindings(process.platform)
    this.bindings = { ...this.defaults }
    const migrated = { ...stored }
    let changed = false
    for (const action of Object.keys(this.defaults) as ShortcutAction[]) {
      if (!stored[action]) continue
      const accelerator = process.platform === 'darwin' ? normalizeMacAccelerator(stored[action]) : stored[action]
      this.bindings[action] = accelerator
      if (accelerator !== stored[action]) {
        migrated[action] = accelerator
        changed = true
      }
    }
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
    // Windows 旧版曾将面试听写绑定为 Alt+Q，与截图冲突；升级时自动迁移到 Alt+R。
    if (process.platform !== 'darwin' && stored.interview_start?.toLowerCase() === 'alt+q') {
      this.bindings.interview_start = this.defaults.interview_start
      migrated.interview_start = this.defaults.interview_start
      changed = true
    }
    // Windows 旧默认值为 Ctrl+B。仅迁移这个历史默认值，用户自定义的其他组合保持不变。
    if (process.platform !== 'darwin' && stored.toggle_visibility?.toLowerCase() === 'ctrl+b') {
      this.bindings.toggle_visibility = this.defaults.toggle_visibility
      migrated.toggle_visibility = this.defaults.toggle_visibility
      changed = true
    }
    if (process.platform === 'darwin') {
      const legacyMac: Record<string, string[]> = {
        screenshot: ['command+q', 'command+w', 'command+option+q'],
        search: ['command+e', 'command+option+e'],
        interview_start: ['command+i', 'command+shift+i'],
      }
      for (const [action, values] of Object.entries(legacyMac)) {
        const current = this.bindings[action]?.toLowerCase()
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

  public getRegistrationErrors(): Array<{ action: string; accelerator: string; mode: string }> {
    return this.registrationErrors.map((item) => ({ ...item }))
  }

  public clearRegistrationErrors(): void {
    this.registrationErrors = []
  }

  public getBindings(): Record<string, string> {
    return { ...this.bindings }
  }

  public getBinding(action: ShortcutAction): string {
    return this.bindings[action] || this.defaults[action]
  }

  public setBinding(action: ShortcutAction, accelerator: string): boolean {
    if (!this.isConfigurable(action)) return false
    const storedAccelerator = process.platform === 'darwin' ? normalizeMacAccelerator(accelerator) : accelerator
    if (this.checkConflict(storedAccelerator, action)) return false
    this.bindings[action] = storedAccelerator
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

  public checkConflict(accelerator: string, excludeAction?: ShortcutAction): ShortcutConflict | null {
    return validateShortcutConflict(process.platform, accelerator, excludeAction, this.bindings)
  }

  public registerGlobalShortcuts(): void {
    this.registerGlobalShortcutsForMode('overlay')
  }

  private registerAction(action: ShortcutAction, accelerator: string, mode: string): void {
    try {
      const electronAccelerator = toElectronAccelerator(accelerator)
      const ret = globalShortcut.register(electronAccelerator, () => {
        if (this.testMode && this.testCallback) {
          this.testCallback(accelerator)
          return
        }
        this.handler?.(action)
      })
      if (ret) this.registered.add(accelerator)
      else {
        console.warn(`[ShortcutsHelper] Failed to register: ${accelerator} for ${action}`)
        this.reportRegistrationError({ action, accelerator, mode })
      }
    } catch (e) {
      console.warn(`[ShortcutsHelper] Error registering ${accelerator}:`, e)
      this.reportRegistrationError({ action, accelerator, mode })
    }
  }

  private reportRegistrationError(data: { action: string; accelerator: string; mode: string }): void {
    this.registrationErrors.push(data)
    if (this.registrationErrors.length > 50) this.registrationErrors.shift()
    this.registrationErrorHandler?.(data)
  }

  private shouldRegister(action: ShortcutAction, _mode: 'overlay' | 'voice' | 'interview'): boolean {
    if (action === 'quit') return false
    // 两个助手可同时运行，因此所有模式都注册同一组快捷键。
    // 具体动作由主进程按“笔试专属 / 面试专属 / 最近激活窗口”独立路由。
    return true
  }

  public registerGlobalShortcutsForMode(mode: 'overlay' | 'voice' | 'interview'): void {
    this.activeMode = mode
    this.clearRegistrationErrors()
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
    return all.filter(action => !!this.bindings[action] && this.shouldRegister(action, mode))
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
        const ret = globalShortcut.register(toElectronAccelerator(accelerator), () => {
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
