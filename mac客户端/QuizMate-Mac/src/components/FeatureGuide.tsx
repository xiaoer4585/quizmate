import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface FeatureGuideStep {
  title: string
  description: string
  target?: string
}

interface FeatureGuideProps {
  open: boolean
  title: string
  steps: FeatureGuideStep[]
  onClose: () => void
  onComplete: () => void
}

interface Rect { top: number; left: number; width: number; height: number }

const EMPTY_RECT: Rect = { top: 0, left: 0, width: 0, height: 0 }

export default function FeatureGuide({ open, title, steps, onClose, onComplete }: FeatureGuideProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect>(EMPTY_RECT)

  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))]

  const updatePosition = (scrollTarget = false) => {
    if (!step?.target) {
      setRect(EMPTY_RECT)
      return
    }
    const target = document.querySelector<HTMLElement>(step.target)
    if (!target) {
      setRect(EMPTY_RECT)
      return
    }
    if (scrollTarget) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    const bounds = target.getBoundingClientRect()
    const padding = 8
    setRect({
      top: Math.max(8, bounds.top - padding),
      left: Math.max(8, bounds.left - padding),
      width: Math.min(window.innerWidth - 16, bounds.width + padding * 2),
      height: Math.min(window.innerHeight - 16, bounds.height + padding * 2),
    })
  }

  useEffect(() => {
    if (!open) return
    setStepIndex(0)
  }, [open, steps.length])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition(true)
    const timer = window.setTimeout(() => updatePosition(false), 260)
    const handlePositionChange = () => updatePosition(false)
    window.addEventListener('resize', handlePositionChange)
    window.addEventListener('scroll', handlePositionChange, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', handlePositionChange)
      window.removeEventListener('scroll', handlePositionChange, true)
    }
  }, [open, stepIndex, step?.target])

  if (!open || !step || steps.length === 0) return null

  const hasTarget = rect.width > 0 && rect.height > 0
  const tooltipWidth = Math.min(360, window.innerWidth - 32)
  const tooltipLeft = hasTarget
    ? Math.min(Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2), window.innerWidth - tooltipWidth - 16)
    : Math.max(16, (window.innerWidth - tooltipWidth) / 2)
  const belowTop = rect.top + rect.height + 16
  const aboveTop = rect.top - 16
  const estimatedHeight = 190
  const tooltipTop = hasTarget && belowTop + estimatedHeight <= window.innerHeight
    ? belowTop
    : hasTarget && aboveTop - estimatedHeight >= 16
      ? aboveTop - estimatedHeight
      : Math.max(16, (window.innerHeight - estimatedHeight) / 2)

  const finish = () => onComplete()
  const next = () => {
    if (stepIndex >= steps.length - 1) finish()
    else setStepIndex((value) => value + 1)
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`absolute inset-0 ${hasTarget ? '' : 'bg-slate-950/65'}`} onClick={onClose} />
      {hasTarget && (
        <div
          className="absolute rounded-lg border-2 border-cyan-300 pointer-events-none transition-all duration-200"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72), 0 0 0 4px rgba(103, 232, 249, 0.18)' }}
        />
      )}
      <div
        className="absolute rounded-xl border border-slate-600 bg-slate-900 p-4 shadow-2xl"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-cyan-300">{title}</div>
            <div className="mt-1 text-base font-semibold text-slate-100">第 {stepIndex + 1} 步：{step.title}</div>
          </div>
          <button className="btn-ghost p-1" onClick={onClose} title="关闭指引"><X size={15} /></button>
        </div>
        <div className="mt-3 flex gap-1.5">
          {steps.map((item, index) => <span key={`${item.title}-${index}`} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-cyan-400' : 'bg-slate-700'}`} />)}
        </div>
        <p className="mt-4 min-h-[3.8rem] text-sm leading-relaxed text-slate-300">{step.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className="btn-ghost text-xs" onClick={onClose}>跳过指引</button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && <button className="btn-outline text-xs" onClick={() => setStepIndex((value) => value - 1)}><ChevronLeft size={14} /> 上一步</button>}
            <button className="btn-primary text-xs" onClick={next}>
              {stepIndex >= steps.length - 1 ? <><CheckCircle2 size={14} /> 完成</> : <>下一步 <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
