import { describe, expect, it } from 'vitest'
import {
  canonicalizeAccelerator,
  getDefaultShortcutBindings,
  type ShortcutAction,
  validateShortcutConflict,
} from '../shortcuts'

describe('shortcut conflict validation', () => {
  it.each([
    ['win32', 'Alt+F4', '关闭当前窗口'],
    ['win32', 'Super+L', 'Windows 徽标键系统功能'],
    ['darwin', 'Command+Space', '打开聚焦搜索'],
    ['darwin', 'Control+Up', '打开调度中心'],
  ])('rejects %s OS shortcut %s', (platform, accelerator, detail) => {
    const conflict = validateShortcutConflict(platform, accelerator, 'search', getDefaultShortcutBindings(platform))
    expect(conflict).toMatchObject({ type: 'os', reason: '和电脑自带快捷键冲突', detail })
  })

  it('classifies fixed QuizMate shortcuts separately', () => {
    const conflict = validateShortcutConflict('win32', 'Ctrl+Shift+T', 'search', getDefaultShortcutBindings('win32'))
    expect(conflict).toMatchObject({
      type: 'quizmate-system',
      reason: '和QuizMate系统快捷键冲突',
      conflictingAction: 'reset',
    })
  })

  it.each([
    ['Alt+Q', 'search', 'exam', '和笔试常用快捷键冲突', 'screenshot'],
    ['Alt+R', 'search', 'interview', '和面试常用快捷键冲突', 'interview_start'],
  ] as Array<[string, ShortcutAction, string, string, ShortcutAction]>)('classifies QuizMate action conflict for %s', (accelerator, action, type, reason, conflictingAction) => {
    expect(validateShortcutConflict('win32', accelerator, action, getDefaultShortcutBindings('win32'))).toMatchObject({
      type,
      reason,
      conflictingAction,
    })
  })

  it('normalizes modifier order and platform aliases', () => {
    expect(canonicalizeAccelerator('Shift+Alt+Ctrl+Q', 'win32')).toBe('ctrl+alt+shift+q')
    expect(canonicalizeAccelerator('Option+Command+Q', 'darwin')).toBe('alt+command+q')
    expect(canonicalizeAccelerator('Super+Option+Q', 'darwin')).toBe('alt+command+q')
    expect(canonicalizeAccelerator('CommandOrControl+Shift+T', 'win32')).toBe('ctrl+shift+t')
    expect(canonicalizeAccelerator('CommandOrControl+Shift+T', 'darwin')).toBe('shift+command+t')
    expect(canonicalizeAccelerator('Control+ArrowUp', 'darwin')).toBe('ctrl+up')
  })

  it('does not report the action being edited as its own conflict', () => {
    const bindings = getDefaultShortcutBindings('win32')
    expect(validateShortcutConflict('win32', bindings.search, 'search', bindings)).toBeNull()
  })

  it.each(['win32', 'darwin'])('keeps all default configurable shortcuts valid on %s', (platform) => {
    const bindings = getDefaultShortcutBindings(platform)
    const configurable: ShortcutAction[] = [
      'screenshot', 'search', 'toggle_visibility', 'copy_content', 'replay',
      'interview_start', 'interview_prev_question', 'interview_next_question',
    ]
    for (const action of configurable) {
      expect(validateShortcutConflict(platform, bindings[action], action, bindings), action).toBeNull()
    }
  })
})
