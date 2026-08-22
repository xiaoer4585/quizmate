import { useState, useEffect, useCallback, useRef } from 'react'
import QueueView from '../components/exam/QueueView'
import SolutionsView from '../components/exam/SolutionsView'
import RawOutputView from '../components/exam/RawOutputView'
import { useTheme } from '../contexts/ThemeContext'
import { shortcutMetadata } from '../../shared/shortcuts'
import { Camera, CheckCircle2, CircleAlert, Loader2, Search, Sparkles } from 'lucide-react'

// 笔试悬浮窗透明背景样式（防止 body 的 bg-slate-950 导致黑屏）
function ExamOverlayStyles() {
  return (
    <style>{`
      html, body, #root { background: transparent !important; margin: 0; padding: 0; height: 100%; overflow: hidden; }
      * { box-sizing: border-box; }
    `}</style>
  )
}

type View = 'queue' | 'solutions' | 'raw-output'
type Status = 'idle' | 'processing' | 'completed' | 'error'
interface Screenshot {
  path: string
  base64?: string
  isExtra?: boolean
}

export default function OverlayPage() {
  const api = (window as any).electronAPI
  const { theme } = useTheme()
  const [view, setView] = useState<View>('queue')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [partialContent, setPartialContent] = useState('')
  const [result, setResult] = useState<any>(null)
  const [rawContent, setRawContent] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.85)
  const [shortcutBindings, setShortcutBindings] = useState<Record<string, string>>({})

  // Load initial data
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const settings = await api.config.getClientSettings()
        if (settings.backgroundOpacity !== undefined) {
          setBackgroundOpacity(settings.backgroundOpacity)
        }
        const bindings = await api.config.getShortcutBindings()
        setShortcutBindings(bindings)
        // Load existing screenshots
        const queuePaths = await api.screenshot.getQueue(false)
        const extraPaths = await api.screenshot.getQueue(true)
        const mainShots: Screenshot[] = []
        for (const p of queuePaths) {
          const b64 = await api.screenshot.fileToBase64(p)
          mainShots.push({ path: p, base64: b64, isExtra: false })
        }
        const extraShots: Screenshot[] = []
        for (const p of extraPaths) {
          const b64 = await api.screenshot.fileToBase64(p)
          extraShots.push({ path: p, base64: b64, isExtra: true })
        }
        setScreenshots([...mainShots, ...extraShots])
      } catch (e) {
        console.error('Failed to load initial data:', e)
      }
    }
    loadInitial()
  }, [api])

  // 悬浮窗始终鼠标穿透，仅通过快捷键操作（移动/缩放/显示隐藏等）
  // 窗口级别的 setIgnoreMouseEvents(true, {forward:true}) 已在主进程设置

  // Event listeners
  useEffect(() => {
    const unsubs: Array<(() => void) | undefined> = []

    unsubs.push(api?.on('screenshot-added', (data: any) => {
      setScreenshots((prev) => {
        const newShot: Screenshot = { path: data.path, base64: data.base64, isExtra: data.isExtra }
        const filtered = prev.filter(s => s.path !== data.path)
        return [...filtered, newShot]
      })
      // Stay on queue view if not processing
      if (status === 'idle' || status === 'error') {
        setView('queue')
      }
    }))

    unsubs.push(api?.on('screenshot-deleted', () => {
      setScreenshots((prev) => {
        const mainShots = prev.filter(s => !s.isExtra)
        if (mainShots.length === 0) return prev
        const latest = mainShots[mainShots.length - 1]
        return prev.filter(s => s.path !== latest.path)
      })
    }))

    // 搜题后服务端清空了截图队列, 同步清空前端显示
    unsubs.push(api?.on('screenshots-cleared', () => {
      setScreenshots([])
    }))

    unsubs.push(api?.on('screenshot-error', (data: any) => {
      setErrorMessage(data.error || '截图失败')
      setStatus('error')
    }))

    unsubs.push(api?.on('initial-start', () => {
      setStatus('processing')
      setView('solutions')
      setProgress(5)
      setProgressMessage('正在创建任务...')
      setPartialContent('')
      setResult(null)
      setErrorMessage('')
    }))

    unsubs.push(api?.on('problem-extracted', (data: any) => {
      setProgress(30)
      setProgressMessage('题目已提取，正在生成答案...')
      if (data.problem) {
        setPartialContent(prev => prev + `\n[题目] ${typeof data.problem === 'string' ? data.problem : JSON.stringify(data.problem)}`)
      }
    }))

    unsubs.push(api?.on('solution-stream-chunk', (data: any) => {
      if (data.progress !== undefined) setProgress(data.progress)
      if (data.message) setProgressMessage(data.message)
      if (data.partialContent) {
        setPartialContent(data.partialContent)
        setStatus('processing')
      }
    }))

    unsubs.push(api?.on('solution-stream-complete', (data: any) => {
      setStatus('completed')
      setProgress(100)
      setProgressMessage('完成')
      // data may contain the formatted result
      if (data && (data.code || data.answer || data.thoughts)) {
        setResult(data)
      } else if (data && data.result) {
        setResult(data.result)
      } else {
        // Use partial content as result
        setResult({ answer: partialContent })
      }
      if (data && data.rawContent) {
        setRawContent(data.rawContent)
      } else {
        setRawContent(partialContent)
      }
    }))

    unsubs.push(api?.on('solution-stream-error', (data: any) => {
      setStatus('error')
      setErrorMessage(data.error || '处理失败')
      // Refund credits on error
      api?.credits.refund(1).catch(() => {})
    }))

    unsubs.push(api?.on('solution-error', (data: any) => {
      setStatus('error')
      setErrorMessage(data.error || '处理失败')
    }))

    unsubs.push(api?.on('processing-unauthorized', () => {
      setStatus('error')
      setErrorMessage('登录已过期，请重新登录')
    }))

    unsubs.push(api?.on('processing-no-screenshots', () => {
      setView('queue')
      setErrorMessage('请先截图')
    }))

    unsubs.push(api?.on('out-of-credits', () => {
      setStatus('error')
      setErrorMessage('积分不足，请充值')
    }))

    unsubs.push(api?.on('background-opacity-changed', (opacity: number) => {
      setBackgroundOpacity(opacity)
    }))

    unsubs.push(api?.on('toggle-raw-output', () => {
      setView((v) => v === 'raw-output' ? 'solutions' : 'raw-output')
    }))

    unsubs.push(api?.on('copy-content', () => {
      handleCopyContent()
    }))

    unsubs.push(api?.on('reset-complete', () => {
      setView('queue')
      setStatus('idle')
      setProgress(0)
      setProgressMessage('')
      setPartialContent('')
      setResult(null)
      setRawContent('')
      setErrorMessage('')
      setScreenshots([])
    }))

    unsubs.push(api?.on('refresh-config', async () => {
      const bindings = await api.config.getShortcutBindings()
      setShortcutBindings(bindings)
    }))

    unsubs.push(api?.on('scroll-content', (data: any) => {
      const container = document.querySelector('.overlay-scroll-container')
      if (container) {
        container.scrollBy({ top: data.direction === 'up' ? -100 : 100, behavior: 'smooth' })
      }
    }))

    unsubs.push(api?.on('trigger-region-screenshot', () => {
      // For simplicity, fall back to full screenshot
      api?.screenshot.captureFull()
    }))

    return () => {
      unsubs.forEach((u) => u && u())
    }
  }, [api, partialContent])

  const handleCopyContent = useCallback(async () => {
    let text = ''
    if (view === 'raw-output') {
      text = rawContent
    } else if (result) {
      const parts: string[] = []
      if (result.code) parts.push('```\n' + result.code + '\n```')
      if (result.answer) parts.push(result.answer)
      if (result.thoughts) parts.push('解题思路：\n' + result.thoughts)
      if (result.timeComplexity) parts.push('时间复杂度：' + result.timeComplexity)
      if (result.spaceComplexity) parts.push('空间复杂度：' + result.spaceComplexity)
      text = parts.join('\n\n')
    } else if (partialContent) {
      text = partialContent
    }
    if (text) {
      await api?.clipboard.writeText(text)
    }
  }, [api, view, result, partialContent, rawContent])

  const mainShots = screenshots.filter(s => !s.isExtra)
  const extraShots = screenshots.filter(s => s.isExtra)

  const statusLabel = status === 'processing'
    ? (progressMessage || '正在分析题目')
    : status === 'completed'
      ? '答案已生成'
      : status === 'error'
        ? (errorMessage || '本次处理失败')
        : mainShots.length > 0
          ? '截图已就绪'
          : '等待截图'

  const StatusIcon = status === 'processing'
    ? Loader2
    : status === 'completed'
      ? CheckCircle2
      : status === 'error'
        ? CircleAlert
        : Camera

  // Build shortcut hints for header - only screenshot + search
  const mainShortcutHints = ['screenshot', 'search']
    .map(a => ({
      label: shortcutMetadata.find(m => m.action === a)?.label || a,
      key: shortcutBindings[a] || '',
    }))
    .filter(s => s.key)

  return (
    <div className="w-full h-full p-1.5" style={{ background: 'transparent', pointerEvents: 'none' }}>
      <ExamOverlayStyles />
      <div
        className="w-full h-full flex flex-col overflow-hidden rounded-lg"
        style={{
          background: theme === 'dark' ? `rgba(18, 21, 29, ${backgroundOpacity})` : `rgba(255, 255, 255, ${backgroundOpacity})`,
          color: theme === 'dark' ? '#f1f5f9' : '#172033',
          border: `1px solid ${theme === 'dark' ? 'rgba(148,163,184,0.18)' : 'rgba(71,85,105,0.18)'}`,
          boxShadow: theme === 'dark' ? '0 12px 32px rgba(0,0,0,0.3)' : '0 12px 32px rgba(15,23,42,0.14)',
          pointerEvents: 'none',
        }}
      >
        <header className="h-11 flex items-center gap-2.5 px-3 border-b border-white/10 shrink-0">
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-cyan-500/15 text-cyan-400">
            <Sparkles size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-none">笔试助手</div>
            <div className="text-[9px] mt-1 opacity-55">截图识题模式</div>
          </div>
          <div className="flex-1" />
          <div className={`flex items-center gap-1.5 text-[10px] font-medium ${status === 'error' ? 'text-red-400' : status === 'completed' ? 'text-emerald-400' : status === 'processing' ? 'text-cyan-400' : 'opacity-60'}`}>
            <StatusIcon size={12} className={status === 'processing' ? 'animate-spin' : ''} />
            <span className="max-w-44 truncate">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] opacity-70">
            {mainShortcutHints.map((shortcut) => (
              <span key={shortcut.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10">
                {shortcut.label === '全屏截图' ? <Camera size={9} /> : <Search size={9} />}
                <span>{shortcut.key}</span>
              </span>
            ))}
          </div>
        </header>

        <main className="flex-1 overlay-scroll-container min-h-0 overflow-y-auto" style={{ pointerEvents: 'none' }}>
          {view === 'queue' && (
            <QueueView
              screenshots={screenshots}
              theme={theme}
              backgroundOpacity={backgroundOpacity}
              screenshotShortcut={shortcutBindings.screenshot}
              searchShortcut={shortcutBindings.search}
            />
          )}
          {view === 'solutions' && (
            <SolutionsView
              status={status}
              progress={progress}
              progressMessage={progressMessage}
              partialContent={partialContent}
              result={result}
              extraScreenshots={extraShots}
              theme={theme}
              backgroundOpacity={backgroundOpacity}
              errorMessage={errorMessage}
            />
          )}
          {view === 'raw-output' && (
            <RawOutputView
              content={rawContent || partialContent}
              theme={theme}
              backgroundOpacity={backgroundOpacity}
            />
          )}
        </main>

        <footer className="h-7 flex items-center justify-between px-3 border-t border-white/10 text-[9px] opacity-60 shrink-0">
          <span>题目截图 {mainShots.length} · 补充截图 {extraShots.length}</span>
          <span>{status === 'processing' ? `生成进度 ${Math.round(progress)}%` : status === 'completed' ? '本次解题已完成' : status === 'error' ? '截图已保留，可直接重试' : '快捷键全局可用'}</span>
        </footer>
      </div>
    </div>
  )
}
