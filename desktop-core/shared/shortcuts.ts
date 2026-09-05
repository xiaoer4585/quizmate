export type ShortcutAction =
  | 'screenshot' | 'search' | 'voice_search' | 'toggle_visibility' | 'copy_content' | 'replay'
  | 'interview_start'
  | 'interview_prev_question' | 'interview_next_question'
  | 'quit' | 'reset' | 'move_up' | 'move_down' | 'move_left' | 'move_right'
  | 'resize_height_larger' | 'resize_height_smaller' | 'resize_width_smaller' | 'resize_width_larger'
  | 'opacity_brighter' | 'opacity_darker' | 'opacity_brighter_alt' | 'opacity_darker_alt'
  | 'zoom_out' | 'zoom_reset' | 'zoom_in' | 'toggle_raw_output' | 'delete_latest_screenshot'
  | 'reset_position' | 'refresh_config'
  | 'restore_main_window'

export type ShortcutCategory = 'main' | 'system'
export interface ShortcutBinding { action: ShortcutAction; accelerator: string; label: string; configurable: boolean; category: ShortcutCategory }
export type ShortcutConflictType = 'os' | 'quizmate-system' | 'exam' | 'interview'
export type ShortcutConflictReason =
  | '和电脑自带快捷键冲突'
  | '和QuizMate系统快捷键冲突'
  | '和笔试常用快捷键冲突'
  | '和面试常用快捷键冲突'
export interface ShortcutConflict {
  type: ShortcutConflictType
  reason: ShortcutConflictReason
  detail: string
  conflictingAction?: ShortcutAction
  conflictingLabel?: string
}

const windowsShortcutBindings: Record<ShortcutAction, string> = {
  screenshot: 'Alt+Q', search: 'Alt+E', voice_search: 'Alt+T', toggle_visibility: 'Alt+B', copy_content: 'Ctrl+Shift+C', replay: 'Ctrl+R',
  interview_start: 'Alt+R',
  interview_prev_question: 'Alt+Up', interview_next_question: 'Alt+Down',
  quit: 'Ctrl+Shift+Q', reset: 'Ctrl+Shift+T', move_up: 'Ctrl+Up', move_down: 'Ctrl+Down', move_left: 'Ctrl+Left', move_right: 'Ctrl+Right',
  resize_height_larger: 'Ctrl+Shift+Up', resize_height_smaller: 'Ctrl+Shift+Down', resize_width_smaller: 'Ctrl+Shift+Left', resize_width_larger: 'Ctrl+Shift+Right',
  opacity_brighter: 'Ctrl+Shift+1', opacity_darker: 'Ctrl+Shift+2', opacity_brighter_alt: 'Ctrl+[', opacity_darker_alt: 'Ctrl+]',
  zoom_out: 'Ctrl+-', zoom_reset: 'Ctrl+0', zoom_in: 'Ctrl+=', toggle_raw_output: 'Ctrl+L', delete_latest_screenshot: 'Ctrl+D', reset_position: 'Ctrl+Shift+R', refresh_config: 'Ctrl+Shift+F5',
  restore_main_window: 'CommandOrControl+Shift+Alt+M',
}

const macShortcutBindings: Record<ShortcutAction, string> = {
  screenshot: 'Option+Q', search: 'Option+E', voice_search: 'Option+T', toggle_visibility: 'Option+B', copy_content: 'Command+C', replay: 'Command+R',
  interview_start: 'Option+R',
  interview_prev_question: 'Option+Up', interview_next_question: 'Option+Down',
  quit: '', reset: 'Command+Shift+T', move_up: 'Command+Up', move_down: 'Command+Down', move_left: 'Command+Left', move_right: 'Command+Right',
  resize_height_larger: 'Command+Shift+Up', resize_height_smaller: 'Command+Shift+Down', resize_width_smaller: 'Command+Shift+Left', resize_width_larger: 'Command+Shift+Right',
  opacity_brighter: 'Command+Shift+1', opacity_darker: 'Command+Shift+2', opacity_brighter_alt: 'Command+[', opacity_darker_alt: 'Command+]',
  zoom_out: 'Command+-', zoom_reset: 'Command+0', zoom_in: 'Command+=', toggle_raw_output: 'Command+L', delete_latest_screenshot: 'Command+D', reset_position: 'Command+Shift+R', refresh_config: 'Command+Shift+F5',
  restore_main_window: 'Command+Shift+Option+M',
}

const macOptionKeyAliases: Record<string, string> = {
  // macOS lays out Option+letter as a composed character in KeyboardEvent.key.
  // Persist the physical letter instead so defaults and captured shortcuts
  // remain stable across layouts and can be registered globally.
  'œ': 'q', '´': 'e', '†': 't', '∫': 'b', '®': 'r', 'ç': 'c',
  'å': 'a', 'ß': 's', 'ƒ': 'f', '∂': 'd', '©': 'g', '˙': 'h', '˚': 'k',
  '¬': 'l', 'µ': 'm', 'ø': 'o', 'π': 'p', '™': 't', '√': 'v', '∑': 'w',
  '≈': 'x', 'Ω': 'z',
}

/** Keep Option in persisted/UI values while Electron receives its Alt accelerator spelling. */
export function normalizeMacAccelerator(accelerator: string): string {
  const parts = accelerator.split('+').map(part => part.trim())
  if (parts.length > 1 && parts.some(part => part.toLowerCase() === 'option' || part.toLowerCase() === 'alt')) {
    const last = parts.length - 1
    parts[last] = macOptionKeyAliases[parts[last]] || macOptionKeyAliases[parts[last].toLowerCase()] || parts[last]
  }
  return parts.map(part => part.toLowerCase() === 'alt' ? 'Option' : part).join('+')
}

/** Windows persists and displays the native Alt spelling, never macOS Option. */
export function normalizeWindowsAccelerator(accelerator: string): string {
  return accelerator.split('+').map(part => part.trim().toLowerCase() === 'option' ? 'Alt' : part.trim()).join('+')
}

const legacyMacDefaultBindings: Partial<Record<ShortcutAction, string[]>> = {
  screenshot: ['command+q', 'command+w', 'command+option+q'],
  search: ['command+e', 'command+option+e'],
  copy_content: ['option+c', 'command+shift+c'],
  replay: ['option+r'],
  interview_start: ['option+i', 'command+i', 'command+shift+i'],
}

/** Migrate known historical Mac defaults only; genuine custom bindings are preserved. */
export function migrateMacLegacyShortcut(action: ShortcutAction, accelerator: string): string {
  const normalized = normalizeMacAccelerator(accelerator)
  const knownDefaults = legacyMacDefaultBindings[action] || []
  return knownDefaults.includes(normalized.toLowerCase()) ? macShortcutBindings[action] : normalized
}

export function toElectronAccelerator(accelerator: string): string {
  return accelerator.split('+').map(part => part.trim().toLowerCase() === 'option' ? 'Alt' : part.trim()).join('+')
}

function resolvePlatform(platform?: string): string {
  return platform || (typeof process !== 'undefined' ? process.platform : '') ||
    (typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent) ? 'darwin' : 'win32')
}

/** Normalize aliases and modifier order so the conflict check cannot be bypassed by alternate spellings. */
export function canonicalizeAccelerator(accelerator: string, platform?: string): string {
  const currentPlatform = resolvePlatform(platform)
  const modifiers = new Set<string>()
  const keys: string[] = []
  const keyAliases: Record<string, string> = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', esc: 'escape',
  }
  for (const rawPart of accelerator.split('+')) {
    const part = rawPart.trim().toLowerCase()
    if (!part) continue
    if (part === 'control' || part === 'ctrl') modifiers.add('ctrl')
    else if (part === 'option' || part === 'alt') modifiers.add('alt')
    else if (part === 'shift') modifiers.add('shift')
    else if (part === 'commandorcontrol' || part === 'cmdorctrl') modifiers.add(currentPlatform === 'darwin' ? 'command' : 'ctrl')
    else if (part === 'command' || part === 'cmd' || part === 'super' || part === 'meta') modifiers.add(currentPlatform === 'darwin' ? 'command' : 'super')
    else keys.push(keyAliases[part] || part)
  }
  const order = ['ctrl', 'alt', 'shift', currentPlatform === 'darwin' ? 'command' : 'super']
  return [...order.filter(part => modifiers.has(part)), ...keys].join('+')
}

/** Return native defaults while keeping the shared module usable in Electron and the renderer. */
export function getDefaultShortcutBindings(platform?: string): Record<ShortcutAction, string> {
  const currentPlatform = resolvePlatform(platform)
  return { ...(currentPlatform === 'darwin' ? macShortcutBindings : windowsShortcutBindings) }
}

export const defaultShortcutBindings: Record<ShortcutAction, string> = getDefaultShortcutBindings()

const mainMetadata: Array<[ShortcutAction, string]> = [
  ['screenshot', '全屏截图'], ['search', '悬浮框搜题'], ['voice_search', '语音播报搜题'], ['toggle_visibility', '显示/隐藏笔试悬浮框'], ['copy_content', '复制答案'], ['replay', '重听答案'],
  ['interview_start', '开始/结束面试'],
  ['interview_prev_question', '上一个问题'], ['interview_next_question', '下一个问题'],
]
const systemMetadata: Array<[ShortcutAction, string]> = [
  ['move_up', '向上移动窗口'], ['move_down', '向下移动窗口'], ['move_left', '向左移动窗口'], ['move_right', '向右移动窗口'],
  ['resize_height_larger', '调高高度'], ['resize_height_smaller', '调小高度'], ['resize_width_smaller', '调小宽度'], ['resize_width_larger', '调大宽度'],
  ['opacity_brighter', '调亮透明度'], ['opacity_darker', '调暗透明度'], ['opacity_brighter_alt', '调亮透明度（备用）'], ['opacity_darker_alt', '调暗透明度（备用）'],
  ['zoom_out', '缩小界面'], ['zoom_reset', '重置缩放'], ['zoom_in', '放大界面'], ['quit', '退出软件'], ['reset', '一键重置'], ['toggle_raw_output', '查看原始输出'], ['delete_latest_screenshot', '删除最新截图'], ['reset_position', '恢复窗口位置'], ['refresh_config', '刷新账号配置'],
  ['restore_main_window', '恢复客户端主窗口'],
]
export const shortcutMetadata: ShortcutBinding[] = [...mainMetadata.map(([action, label]) => ({ action, label, accelerator: defaultShortcutBindings[action], configurable: true, category: 'main' as const })), ...systemMetadata.map(([action, label]) => ({ action, label, accelerator: defaultShortcutBindings[action], configurable: false, category: 'system' as const }))]
export const configurableActions = shortcutMetadata.filter(s => s.configurable).map(s => s.action)
export function getShortcutLabel(action: ShortcutAction) { return shortcutMetadata.find(s => s.action === action)?.label || action }
export function isConfigurable(action: ShortcutAction) { return shortcutMetadata.find(s => s.action === action)?.configurable || false }
export type ProcessingMode = 'overlay' | 'voice' | 'universal'
export const examOverlayShortcutActions: ShortcutAction[] = ['screenshot', 'search', 'toggle_visibility', 'copy_content']
export const examVoiceShortcutActions: ShortcutAction[] = ['voice_search', 'replay']
export const interviewShortcutActions: ShortcutAction[] = ['interview_start', 'interview_prev_question', 'interview_next_question']
export const modeByAction: Partial<Record<ShortcutAction, ProcessingMode>> = { search: 'overlay', voice_search: 'voice' }

/** Only the search action for the active exam presentation mode may own a global shortcut. */
export function shouldRegisterShortcutForProcessingMode(action: ShortcutAction, mode: 'overlay' | 'voice'): boolean {
  if (action === 'search') return mode === 'overlay'
  if (action === 'voice_search') return mode === 'voice'
  return true
}

const examShortcutActionSet = new Set<ShortcutAction>(['screenshot', 'search', 'voice_search', 'toggle_visibility', 'copy_content', 'replay'])
const interviewShortcutActionSet = new Set<ShortcutAction>(interviewShortcutActions)

const windowsOsShortcutDetails: Record<string, string> = {
  'alt+f4': '关闭当前窗口',
  'alt+tab': '切换应用程序',
  'alt+shift+tab': '反向切换应用程序',
  'alt+space': '打开当前窗口系统菜单',
  'alt+escape': '按打开顺序切换窗口',
  'ctrl+escape': '打开开始菜单',
  'ctrl+shift+escape': '打开任务管理器',
  'ctrl+alt+delete': '打开 Windows 安全选项',
  'ctrl+alt+tab': '打开应用切换界面',
  printscreen: '系统截屏',
  'alt+printscreen': '截取当前窗口',
}

const macOsShortcutDetails: Record<string, string> = {
  'command+q': '退出当前应用',
  'command+w': '关闭当前窗口',
  'command+m': '最小化当前窗口',
  'command+h': '隐藏当前应用',
  'command+tab': '切换应用程序',
  'shift+command+tab': '反向切换应用程序',
  'command+space': '打开聚焦搜索',
  'alt+command+escape': '打开强制退出窗口',
  'ctrl+command+q': '锁定屏幕',
  'shift+command+3': '截取全屏',
  'shift+command+4': '截取屏幕区域',
  'shift+command+5': '打开截屏与录屏工具',
  'ctrl+up': '打开调度中心',
  'ctrl+down': '显示当前应用的所有窗口',
  'ctrl+left': '切换到左侧桌面',
  'ctrl+right': '切换到右侧桌面',
  'ctrl+command+f': '切换全屏',
  'alt+command+d': '显示或隐藏程序坞',
  'command+`': '切换同一应用的窗口',
}

function getOsShortcutDetail(platform: string, accelerator: string): string | null {
  if (platform === 'darwin') return macOsShortcutDetails[accelerator] || null
  if (accelerator === 'super' || accelerator.startsWith('super+')) return 'Windows 徽标键系统功能'
  return windowsOsShortcutDetails[accelerator] || null
}

/** Shared renderer/main-process guard. The main process must call this again before persisting. */
export function validateShortcutConflict(
  platform: string,
  accelerator: string,
  excludeAction: ShortcutAction | undefined,
  bindings: Record<string, string>,
): ShortcutConflict | null {
  const canonical = canonicalizeAccelerator(accelerator, platform)
  const osDetail = getOsShortcutDetail(platform, canonical)
  if (osDetail) {
    return { type: 'os', reason: '和电脑自带快捷键冲突', detail: osDetail }
  }

  const matchingActions = (Object.keys(bindings) as ShortcutAction[]).filter(action =>
    action !== excludeAction && !!bindings[action] && canonicalizeAccelerator(bindings[action], platform) === canonical,
  )
  const matchingAction = matchingActions.find(action => !examShortcutActionSet.has(action) && !interviewShortcutActionSet.has(action))
    || matchingActions.find(action => examShortcutActionSet.has(action))
    || matchingActions.find(action => interviewShortcutActionSet.has(action))
  if (!matchingAction) return null

  const conflictingLabel = getShortcutLabel(matchingAction)
  if (examShortcutActionSet.has(matchingAction)) {
    return {
      type: 'exam', reason: '和笔试常用快捷键冲突', detail: `已用于“${conflictingLabel}”`,
      conflictingAction: matchingAction, conflictingLabel,
    }
  }
  if (interviewShortcutActionSet.has(matchingAction)) {
    return {
      type: 'interview', reason: '和面试常用快捷键冲突', detail: `已用于“${conflictingLabel}”`,
      conflictingAction: matchingAction, conflictingLabel,
    }
  }
  return {
    type: 'quizmate-system', reason: '和QuizMate系统快捷键冲突', detail: `已用于“${conflictingLabel}”`,
    conflictingAction: matchingAction, conflictingLabel,
  }
}

// ===== 平台展示辅助（主进程/渲染层共用） =====

/** 当前是否为 macOS(渲染层无 process 对象, 退化为 userAgent 判定) */
export function isMacPlatform(): boolean {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'darwin'
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return /Macintosh|Mac OS X/i.test(navigator.userAgent)
  }
  return false
}

/** 按平台展示快捷键：macOS 使用 option/command 等可读文字，Windows 保持 Ctrl/Alt 原样。 */
export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return accelerator
  if (isMacPlatform()) return formatAcceleratorText(accelerator)
  return accelerator
}

/** Textual accelerator for settings and help, using the native modifier name per platform. */
export function formatAcceleratorText(accelerator: string): string {
  if (!accelerator) return accelerator
  const mac = isMacPlatform()
  const parts = accelerator.split('+')
  return parts.map((part, index) => {
    const p = part.trim()
    const lower = p.toLowerCase()
    if (lower === 'alt' || lower === 'option') return mac ? 'option' : 'alt'
    if (lower === 'command' || lower === 'cmd' || lower === 'super' || lower === 'meta') return mac ? 'command' : 'ctrl'
    if (lower === 'control' || lower === 'ctrl') return 'ctrl'
    if (lower === 'shift') return 'shift'
    if (index === parts.length - 1 && p.length === 1) return p.toLowerCase()
    return p
  }).join('+')
}
