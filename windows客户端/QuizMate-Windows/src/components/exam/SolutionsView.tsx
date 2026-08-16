import { AlertCircle, CheckCircle2, Code2, Lightbulb, Loader2, Sparkles } from 'lucide-react'

interface SolutionsViewProps {
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  progressMessage: string
  partialContent: string
  result: {
    code?: string
    thoughts?: string
    timeComplexity?: string
    spaceComplexity?: string
    answer?: string
    rawContent?: string
    mode?: string
  } | null
  extraScreenshots: Array<{ path: string; base64?: string }>
  theme: 'dark' | 'light'
  backgroundOpacity: number
  errorMessage: string
}

export default function SolutionsView({
  status, progress, progressMessage, partialContent, result,
  extraScreenshots, theme, errorMessage,
}: SolutionsViewProps) {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ color: theme === 'dark' ? '#eceef2' : '#1a1d28', pointerEvents: 'none' }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          {status === 'processing' ? <Loader2 size={13} className="text-cyan-400 animate-spin" /> : status === 'completed' ? <CheckCircle2 size={13} className="text-emerald-400" /> : status === 'error' ? <AlertCircle size={13} className="text-red-400" /> : <Sparkles size={13} className="text-cyan-400" />}
          <span>{status === 'processing' ? (progressMessage || '正在生成答案') : status === 'completed' ? '参考答案' : status === 'error' ? '处理失败' : '参考答案'}</span>
        </div>
        {status === 'processing' && <span className="text-[9px] text-cyan-400">{Math.round(progress)}%</span>}
      </div>

      {status === 'processing' && (
        <div className="h-0.5 bg-white/10">
          <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(5, progress))}%` }} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3.5">
        {status === 'error' ? (
          <div className="p-3 rounded-md border border-red-400/20 bg-red-500/10 text-[11px] leading-relaxed text-red-300">
            {errorMessage || '处理失败，请重试'}
          </div>
        ) : status === 'processing' && !partialContent ? (
          <div className="h-full min-h-28 flex items-center justify-center text-[10px] opacity-50">正在读取题目并组织答案</div>
        ) : result ? (
          <div className="space-y-4">
            {result.code && (
              <div>
                <div className="flex items-center gap-1.5 text-[9px] opacity-55 mb-1.5"><Code2 size={11} />代码</div>
                <pre className="code-block p-3 rounded-md bg-black/35 border border-white/10 text-emerald-300 text-[10px] leading-relaxed overflow-x-auto">{result.code}</pre>
              </div>
            )}
            {result.answer && (
              <div>
                <div className="flex items-center gap-1.5 text-[9px] opacity-55 mb-1.5"><Sparkles size={11} />答案</div>
                <div className="text-[11px] leading-[1.7] whitespace-pre-wrap">{result.answer}</div>
              </div>
            )}
            {result.thoughts && (
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center gap-1.5 text-[9px] opacity-55 mb-1.5"><Lightbulb size={11} />解题思路</div>
                <div className="text-[11px] leading-[1.7] whitespace-pre-wrap">{result.thoughts}</div>
              </div>
            )}
            {(result.timeComplexity || result.spaceComplexity) && (
              <div className="flex flex-wrap gap-2 text-[9px]">
                {result.timeComplexity && <div><span className="opacity-50">时间复杂度 </span><span className="font-mono text-cyan-300">{result.timeComplexity}</span></div>}
                {result.spaceComplexity && <div><span className="opacity-50">空间复杂度 </span><span className="font-mono text-cyan-300">{result.spaceComplexity}</span></div>}
              </div>
            )}
          </div>
        ) : partialContent ? (
          <div className="text-[11px] leading-[1.7] whitespace-pre-wrap">{partialContent}</div>
        ) : (
          <div className="h-full min-h-28 flex items-center justify-center text-[10px] opacity-50">暂无答案内容</div>
        )}

        {extraScreenshots.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="text-[9px] opacity-55 mb-1.5">补充截图</div>
            <div className="flex gap-2 flex-wrap">
              {extraScreenshots.map((shot, index) => (
                <img key={shot.path || index} src={shot.base64} alt={`补充 ${index + 1}`} className="w-20 h-14 object-cover rounded-md border border-white/10" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
