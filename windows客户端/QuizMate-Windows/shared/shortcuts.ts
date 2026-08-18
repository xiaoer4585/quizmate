export type ShortcutAction =
  | 'screenshot' | 'search' | 'toggle_visibility' | 'copy_content' | 'replay'
  | 'interview_start'
  | 'interview_prev_question' | 'interview_next_question'
  | 'quit' | 'reset' | 'move_up' | 'move_down' | 'move_left' | 'move_right'
  | 'resize_height_larger' | 'resize_height_smaller' | 'resize_width_smaller' | 'resize_width_larger'
  | 'opacity_brighter' | 'opacity_darker' | 'opacity_brighter_alt' | 'opacity_darker_alt'
  | 'zoom_out' | 'zoom_reset' | 'zoom_in' | 'toggle_raw_output' | 'delete_latest_screenshot'
  | 'reset_position' | 'refresh_config'

export type ShortcutCategory = 'main' | 'system'
export interface ShortcutBinding { action: ShortcutAction; accelerator: string; label: string; configurable: boolean; category: ShortcutCategory }

export const defaultShortcutBindings: Record<ShortcutAction, string> = {
  screenshot: 'Alt+Q', search: 'Alt+E', toggle_visibility: 'Ctrl+B', copy_content: 'Ctrl+Shift+C', replay: 'Ctrl+R',
  interview_start: 'Alt+Q',
  interview_prev_question: 'Alt+Up', interview_next_question: 'Alt+Down',
  quit: 'Ctrl+Shift+Q', reset: 'Ctrl+Shift+T', move_up: 'Ctrl+Up', move_down: 'Ctrl+Down', move_left: 'Ctrl+Left', move_right: 'Ctrl+Right',
  resize_height_larger: 'Ctrl+Shift+Up', resize_height_smaller: 'Ctrl+Shift+Down', resize_width_smaller: 'Ctrl+Shift+Left', resize_width_larger: 'Ctrl+Shift+Right',
  opacity_brighter: 'Ctrl+Shift+1', opacity_darker: 'Ctrl+Shift+2', opacity_brighter_alt: 'Ctrl+[', opacity_darker_alt: 'Ctrl+]',
  zoom_out: 'Ctrl+-', zoom_reset: 'Ctrl+0', zoom_in: 'Ctrl+=', toggle_raw_output: 'Ctrl+L', delete_latest_screenshot: 'Ctrl+D', reset_position: 'Ctrl+Shift+R', refresh_config: 'Ctrl+Shift+F5',
}

const mainMetadata: Array<[ShortcutAction, string]> = [
  ['screenshot', '全屏截图'], ['search', '搜题'], ['toggle_visibility', '显示/隐藏悬浮框'], ['copy_content', '复制答案'], ['replay', '重听答案'],
  ['interview_start', '开始/结束听写'],
  ['interview_prev_question', '上一个问题'], ['interview_next_question', '下一个问题'],
]
const systemMetadata: Array<[ShortcutAction, string]> = [
  ['move_up', '向上移动窗口'], ['move_down', '向下移动窗口'], ['move_left', '向左移动窗口'], ['move_right', '向右移动窗口'],
  ['resize_height_larger', '调高高度'], ['resize_height_smaller', '调小高度'], ['resize_width_smaller', '调小宽度'], ['resize_width_larger', '调大宽度'],
  ['opacity_brighter', '调亮透明度'], ['opacity_darker', '调暗透明度'], ['opacity_brighter_alt', '调亮透明度（备用）'], ['opacity_darker_alt', '调暗透明度（备用）'],
  ['zoom_out', '缩小界面'], ['zoom_reset', '重置缩放'], ['zoom_in', '放大界面'], ['quit', '退出软件'], ['reset', '一键重置'], ['toggle_raw_output', '查看原始输出'], ['delete_latest_screenshot', '删除最新截图'], ['reset_position', '恢复窗口位置'], ['refresh_config', '刷新账号配置'],
]
export const shortcutMetadata: ShortcutBinding[] = [...mainMetadata.map(([action, label]) => ({ action, label, accelerator: defaultShortcutBindings[action], configurable: true, category: 'main' as const })), ...systemMetadata.map(([action, label]) => ({ action, label, accelerator: defaultShortcutBindings[action], configurable: false, category: 'system' as const }))]
export const configurableActions = shortcutMetadata.filter(s => s.configurable).map(s => s.action)
export function getShortcutLabel(action: ShortcutAction) { return shortcutMetadata.find(s => s.action === action)?.label || action }
export function isConfigurable(action: ShortcutAction) { return shortcutMetadata.find(s => s.action === action)?.configurable || false }
export type ProcessingMode = 'overlay' | 'voice' | 'universal'
export const examOverlayShortcutActions: ShortcutAction[] = ['screenshot', 'search', 'toggle_visibility', 'copy_content']
export const examVoiceShortcutActions: ShortcutAction[] = ['search', 'toggle_visibility', 'replay']
export const interviewShortcutActions: ShortcutAction[] = ['interview_start', 'interview_prev_question', 'interview_next_question']
export const modeByAction: Partial<Record<ShortcutAction, ProcessingMode>> = { search: 'overlay' }
