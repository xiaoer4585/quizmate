import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Pencil, RotateCcw } from 'lucide-react'
import {
  defaultShortcutBindings,
  getShortcutLabel,
  shortcutMetadata,
  type ShortcutAction,
} from '../../shared/shortcuts'

interface ShortcutSettingsProps {
  commonActions: ShortcutAction[]
  bindings: Record<string, string>
  onBindingsChange: (bindings: Record<string, string>) => void
  accentClass?: string
}

export default function ShortcutSettings({
  commonActions,
  bindings,
  onBindingsChange,
  accentClass = 'bg-exam',
}: ShortcutSettingsProps) {
  const api = (window as any).electronAPI
  const [editingAction, setEditingAction] = useState<ShortcutAction | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState('')
  const captureRef = useRef<HTMLDivElement>(null)

  const commonShortcuts = useMemo(
    () => commonActions
      .map((action) => shortcutMetadata.find((item) => item.action === action))
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [commonActions],
  )
  const systemShortcuts = useMemo(
    () => shortcutMetadata.filter((item) => !item.configurable),
    [],
  )

  useEffect(() => {
    if (capturing) captureRef.current?.focus()
    return () => {
      if (capturing) api.config.resumeGlobalShortcuts()
    }
  }, [api, capturing])

  useEffect(() => {
    let active = true
    const showRegistrationErrors = (errors: any) => {
      const latest = Array.isArray(errors) ? errors[errors.length - 1] : errors
      if (!active || !latest) return
      setStatus(`${latest.accelerator || '快捷键'} 注册失败，可能被其他应用占用，请更换组合键后重试`)
    }
    api.config.getShortcutRegistrationErrors?.().then(showRegistrationErrors).catch(() => {})
    const unsubscribe = api.on?.('shortcut-registration-error', showRegistrationErrors)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [api])

  const beginCapture = (action: ShortcutAction) => {
    setEditingAction(action)
    setCapturing(true)
    setStatus('请按下新的快捷键组合')
    api.config.pauseGlobalShortcuts()
  }

  const finishCapture = () => {
    setCapturing(false)
    setEditingAction(null)
    api.config.resumeGlobalShortcuts()
  }

  const formatConflict = (accelerator: string, conflict: any) => {
    if (conflict?.reason) {
      return `${accelerator} ${conflict.reason}${conflict.detail ? `（${conflict.detail}）` : ''}`
    }
    return `${accelerator} 已被“${getShortcutLabel(conflict)}”占用`
  }

  const handleCapture = async (event: React.KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      finishCapture()
      setStatus('已取消')
      return
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return

    const parts: string[] = []
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')
    if (event.metaKey) parts.push('Super')
    let key = event.key === ' ' ? 'Space' : event.key
    if (key.startsWith('Arrow')) key = key.slice('Arrow'.length)
    if (key.length === 1) key = key.toUpperCase()
    parts.push(key)
    const accelerator = parts.join('+')
    const action = editingAction

    if (!action) {
      finishCapture()
      return
    }

    try {
      const conflict = await api.config.checkShortcutConflict(accelerator, action)
      if (conflict) {
        finishCapture()
        setStatus(formatConflict(accelerator, conflict))
        return
      }
      const updated = await api.config.setShortcutBinding(action, accelerator)
      finishCapture()
      if (updated === true || updated?.success === true) {
        onBindingsChange(await api.config.getShortcutBindings())
        setStatus(`${getShortcutLabel(action)}已设置为 ${accelerator}`)
      } else {
        setStatus(updated?.conflict
          ? formatConflict(accelerator, updated.conflict)
          : '设置失败，请换一个快捷键组合')
      }
    } catch (error) {
      finishCapture()
      setStatus(`设置失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const resetShortcut = async (action: ShortcutAction) => {
    await api.config.resetShortcutBinding(action)
    onBindingsChange(await api.config.getShortcutBindings())
    setStatus(`${getShortcutLabel(action)}已恢复默认值`)
  }

  const resetCurrentGroup = async () => {
    const confirmed = await api.dialog.confirm('确定要重置当前页面的常用快捷键吗？', '重置快捷键')
    if (!confirmed) return
    for (const action of commonActions) await api.config.resetShortcutBinding(action)
    onBindingsChange(await api.config.getShortcutBindings())
    setStatus('当前页面快捷键已恢复默认值')
  }

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Keyboard size={16} /> 常用快捷键
          </h3>
          <button onClick={resetCurrentGroup} className="btn-ghost text-xs" title="重置当前页面快捷键">
            <RotateCcw size={13} /> 重置本页
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {commonShortcuts.map((meta) => (
            <div key={meta.action} data-guide-target={`shortcut-${meta.action}`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800/80">
              <span className="text-sm min-w-0">{meta.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <kbd className={`min-w-20 text-center px-2 py-1 text-xs rounded border ${editingAction === meta.action ? `${accentClass} border-transparent text-white animate-pulse` : 'bg-slate-800 border-slate-700'}`}>
                  {editingAction === meta.action ? '等待按键' : (bindings[meta.action] || meta.accelerator)}
                </kbd>
                <button onClick={() => beginCapture(meta.action)} className="btn-outline text-xs px-2 py-1" title={`更改${meta.label}`}>
                  <Pencil size={12} /> 更改
                </button>
                <button onClick={() => resetShortcut(meta.action)} className="btn-ghost text-xs px-2 py-1" title={`重置${meta.label}`}>
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {status && <p className="text-xs mt-3 text-slate-400">{status}</p>}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold mb-3">系统快捷键</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {systemShortcuts.map((meta) => (
            <div key={meta.action} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800/80">
              <span className="text-sm">{meta.label}</span>
              <kbd className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700">
                {bindings[meta.action] || defaultShortcutBindings[meta.action]}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {capturing && (
        <div
          ref={captureRef}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          tabIndex={-1}
          onKeyDown={handleCapture}
        >
          <div className="w-[320px] rounded-lg border border-slate-700 bg-slate-900 p-7 text-center shadow-2xl pointer-events-none">
            <Keyboard size={36} className="mx-auto mb-4 text-brand" />
            <p className="text-base font-medium">设置{editingAction ? getShortcutLabel(editingAction) : ''}</p>
            <p className="text-xs text-slate-400 mt-2">按下组合键，Esc 取消</p>
          </div>
        </div>
      )}
    </>
  )
}
