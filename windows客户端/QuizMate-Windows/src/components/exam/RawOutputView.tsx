import { Braces } from 'lucide-react'

interface RawOutputViewProps {
  content: string
  theme: 'dark' | 'light'
  backgroundOpacity: number
}

export default function RawOutputView({ content, theme }: RawOutputViewProps) {
  return (
    <div className="w-full h-full flex flex-col" style={{ color: theme === 'dark' ? '#eceef2' : '#1a1d28', pointerEvents: 'none' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        <Braces size={13} className="text-cyan-400" />
        <div className="text-[11px] font-semibold">原始输出</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5">
        <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono opacity-90">{content || '暂无原始输出'}</pre>
      </div>
    </div>
  )
}
