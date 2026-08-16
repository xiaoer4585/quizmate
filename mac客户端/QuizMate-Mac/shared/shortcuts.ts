// macOS shortcut bindings shared between main process and renderer.

export type ShortcutAction =
  | 'screenshot'           // 全屏截图 (可配置)
  | 'search'               // 搜题 (可配置)
  | 'toggle_visibility'    // 显示/隐藏悬浮框 (可配置)
  | 'copy_content'         // 复制答案 (可配置)
  | 'replay'               // 重听上次答案 (可配置，语音模式专用)
  | 'interview_start'      // 开始面试听写
  | 'interview_stop'       // 停止面试听写
  | 'quit'                 // 退出软件
  | 'reset'                // 一键重置
  | 'move_up'              // 向上移动窗口
  | 'move_down'            // 向下移动窗口
  | 'move_left'            // 向左移动窗口
  | 'move_right'           // 向右移动窗口
  | 'resize_height_larger'  // 调高高度
  | 'resize_height_smaller' // 调小高度
  | 'resize_width_smaller'  // 调小宽度
  | 'resize_width_larger'   // 调大宽度
  | 'opacity_brighter'     // 调亮透明度
  | 'opacity_darker'       // 调暗透明度
  | 'opacity_brighter_alt' // 调亮透明度（备用）
  | 'opacity_darker_alt'   // 调暗透明度（备用）
  | 'zoom_out'             // 缩小界面
  | 'zoom_reset'           // 重置缩放
  | 'zoom_in'              // 放大界面
  | 'toggle_raw_output'    // 查看原始输出
  | 'delete_latest_screenshot' // 删除最新截图
  | 'reset_position'       // 恢复窗口位置
  | 'refresh_config'       // 刷新账号配置

export type ShortcutCategory = 'main' | 'system'

export interface ShortcutBinding {
  action: ShortcutAction
  accelerator: string
  label: string
  configurable: boolean
  category: ShortcutCategory
}

export const defaultShortcutBindings: Record<ShortcutAction, string> = {
  // 可配置
  screenshot: 'Alt+Q',
  search: 'Alt+E',
  toggle_visibility: 'Command+B',
  copy_content: 'Command+Shift+C',
  replay: 'Command+R',
  interview_start: 'Command+Shift+I',
  interview_stop: 'Command+Shift+O',
  // 系统固定
  quit: 'Command+Shift+Q',
  reset: 'Command+Shift+T',
  move_up: 'Command+Up',
  move_down: 'Command+Down',
  move_left: 'Command+Left',
  move_right: 'Command+Right',
  resize_height_larger: 'Command+Shift+Up',
  resize_height_smaller: 'Command+Shift+Down',
  resize_width_smaller: 'Command+Shift+Left',
  resize_width_larger: 'Command+Shift+Right',
  opacity_brighter: 'Command+Shift+1',
  opacity_darker: 'Command+Shift+2',
  opacity_brighter_alt: 'Command+[',
  opacity_darker_alt: 'Command+]',
  zoom_out: 'Command+-',
  zoom_reset: 'Command+0',
  zoom_in: 'Command+=',
  toggle_raw_output: 'Command+L',
  delete_latest_screenshot: 'Command+D',
  reset_position: 'Command+Shift+R',
  refresh_config: 'Command+Shift+F5',
}

const macModifierAliases: Record<string, string> = {
  command: 'Command',
  cmd: 'Command',
  commandorcontrol: 'Command',
  cmdorctrl: 'Command',
  control: 'Command',
  ctrl: 'Command',
  super: 'Command',
  meta: 'Command',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
}

/** Convert inherited Windows/Electron aliases to native Mac accelerators. */
export function normalizeMacAccelerator(accelerator: string): string {
  const normalized: string[] = []
  for (const rawPart of accelerator.split('+').map(part => part.trim()).filter(Boolean)) {
    const part = macModifierAliases[rawPart.toLowerCase()] || rawPart
    if (!normalized.some(item => item.toLowerCase() === part.toLowerCase())) normalized.push(part)
  }
  return normalized.join('+')
}

/** Present Electron accelerators with familiar macOS keyboard symbols. */
export function formatMacAccelerator(accelerator: string): string {
  const labels: Record<string, string> = {
    command: '⌘',
    shift: '⇧',
    alt: '⌥',
    option: '⌥',
    control: '⌃',
    ctrl: '⌃',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    space: 'Space',
  }
  return normalizeMacAccelerator(accelerator)
    .split('+')
    .map(part => labels[part.toLowerCase()] || part)
    .join('')
}

export const shortcutMetadata: ShortcutBinding[] = [
  { action: 'screenshot', accelerator: defaultShortcutBindings.screenshot, label: '全屏截图', configurable: true, category: 'main' },
  { action: 'search', accelerator: defaultShortcutBindings.search, label: '搜题', configurable: true, category: 'main' },
  { action: 'toggle_visibility', accelerator: defaultShortcutBindings.toggle_visibility, label: '显示/隐藏悬浮框', configurable: true, category: 'main' },
  { action: 'copy_content', accelerator: defaultShortcutBindings.copy_content, label: '复制答案', configurable: true, category: 'main' },
  { action: 'replay', accelerator: defaultShortcutBindings.replay, label: '重听答案', configurable: true, category: 'main' },
  { action: 'interview_start', accelerator: defaultShortcutBindings.interview_start, label: '开始听写', configurable: true, category: 'main' },
  { action: 'interview_stop', accelerator: defaultShortcutBindings.interview_stop, label: '停止听写', configurable: true, category: 'main' },
  { action: 'move_up', accelerator: defaultShortcutBindings.move_up, label: '向上移动窗口', configurable: false, category: 'system' },
  { action: 'move_down', accelerator: defaultShortcutBindings.move_down, label: '向下移动窗口', configurable: false, category: 'system' },
  { action: 'move_left', accelerator: defaultShortcutBindings.move_left, label: '向左移动窗口', configurable: false, category: 'system' },
  { action: 'move_right', accelerator: defaultShortcutBindings.move_right, label: '向右移动窗口', configurable: false, category: 'system' },
  { action: 'resize_height_larger', accelerator: defaultShortcutBindings.resize_height_larger, label: '调高高度', configurable: false, category: 'system' },
  { action: 'resize_height_smaller', accelerator: defaultShortcutBindings.resize_height_smaller, label: '调小高度', configurable: false, category: 'system' },
  { action: 'resize_width_smaller', accelerator: defaultShortcutBindings.resize_width_smaller, label: '调小宽度', configurable: false, category: 'system' },
  { action: 'resize_width_larger', accelerator: defaultShortcutBindings.resize_width_larger, label: '调大宽度', configurable: false, category: 'system' },
  { action: 'opacity_brighter', accelerator: defaultShortcutBindings.opacity_brighter, label: '调亮透明度', configurable: false, category: 'system' },
  { action: 'opacity_darker', accelerator: defaultShortcutBindings.opacity_darker, label: '调暗透明度', configurable: false, category: 'system' },
  { action: 'opacity_brighter_alt', accelerator: defaultShortcutBindings.opacity_brighter_alt, label: '调亮透明度（备用）', configurable: false, category: 'system' },
  { action: 'opacity_darker_alt', accelerator: defaultShortcutBindings.opacity_darker_alt, label: '调暗透明度（备用）', configurable: false, category: 'system' },
  { action: 'zoom_out', accelerator: defaultShortcutBindings.zoom_out, label: '缩小界面', configurable: false, category: 'system' },
  { action: 'zoom_reset', accelerator: defaultShortcutBindings.zoom_reset, label: '重置缩放', configurable: false, category: 'system' },
  { action: 'zoom_in', accelerator: defaultShortcutBindings.zoom_in, label: '放大界面', configurable: false, category: 'system' },
  { action: 'quit', accelerator: defaultShortcutBindings.quit, label: '退出软件', configurable: false, category: 'system' },
  { action: 'reset', accelerator: defaultShortcutBindings.reset, label: '一键重置', configurable: false, category: 'system' },
  { action: 'toggle_raw_output', accelerator: defaultShortcutBindings.toggle_raw_output, label: '查看原始输出', configurable: false, category: 'system' },
  { action: 'delete_latest_screenshot', accelerator: defaultShortcutBindings.delete_latest_screenshot, label: '删除最新截图', configurable: false, category: 'system' },
  { action: 'reset_position', accelerator: defaultShortcutBindings.reset_position, label: '恢复窗口位置', configurable: false, category: 'system' },
  { action: 'refresh_config', accelerator: defaultShortcutBindings.refresh_config, label: '刷新账号配置', configurable: false, category: 'system' },
]

export const configurableActions: ShortcutAction[] = shortcutMetadata
  .filter(s => s.configurable)
  .map(s => s.action)

export function getShortcutLabel(action: ShortcutAction): string {
  const meta = shortcutMetadata.find(s => s.action === action)
  return meta ? meta.label : action
}

export function isConfigurable(action: ShortcutAction): boolean {
  const meta = shortcutMetadata.find(s => s.action === action)
  return meta ? meta.configurable : false
}

export type ProcessingMode = 'overlay' | 'voice' | 'universal'

export const examOverlayShortcutActions: ShortcutAction[] = [
  'screenshot',
  'search',
  'toggle_visibility',
  'copy_content',
]

export const examVoiceShortcutActions: ShortcutAction[] = [
  'search',
  'toggle_visibility',
  'replay',
]

export const interviewShortcutActions: ShortcutAction[] = [
  'interview_start',
  'interview_stop',
]

export const modeByAction: Partial<Record<ShortcutAction, ProcessingMode>> = {
  search: 'overlay',
}
