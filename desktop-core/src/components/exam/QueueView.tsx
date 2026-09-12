import { Camera, Images, Search } from 'lucide-react'
import { defaultShortcutBindings, formatAccelerator } from '../../../shared/shortcuts'

interface QueueViewProps {
  screenshots: Array<{ path: string; base64?: string; isExtra?: boolean }>
  theme: 'dark' | 'light'
  backgroundOpacity: number
  screenshotShortcut?: string
  searchShortcut?: string
}

export default function QueueView({
  screenshots,
  theme,
  screenshotShortcut,
  searchShortcut,
}: QueueViewProps) {
  const mainShots = screenshots.filter(s => !s.isExtra)
  const extraCount = screenshots.length - mainShots.length
  const shotLimit = 3
  const atLimit = mainShots.length >= shotLimit

  return (
    <div
      className="w-full h-full flex flex-col p-3"
      style={{ color: theme === 'dark' ? '#eceef2' : '#1a1d28', pointerEvents: 'none' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Images size={13} className="text-cyan-400" />
          <div className="text-[11px] font-semibold">题目截图</div>
        </div>
        <div className="text-[9px] opacity-50">{mainShots.length} 张{extraCount > 0 ? ` · ${extraCount} 张补充` : ''}</div>
      </div>

      {mainShots.length === 0 ? (
        <div className="flex-1 min-h-32 flex items-center justify-center text-center">
          <div className="max-w-52">
            <div className="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center bg-cyan-500/10 text-cyan-400 border border-cyan-400/15">
              <Camera size={19} />
            </div>
            <div className="text-[11px] font-medium">等待题目截图</div>
            <div className="mt-2 space-y-1 text-[9px] opacity-50">
              <div className="flex items-center justify-center gap-1.5">
                <span>{formatAccelerator(screenshotShortcut || defaultShortcutBindings.screenshot)}</span>
                <span>截图</span>
                <span>·</span>
                <span>{formatAccelerator(searchShortcut || defaultShortcutBindings.search)}</span>
                <span>搜题</span>
              </div>
              <div>题目太长可分多次截图，最多 3 张后按搜题，一次一起发给 AI。</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
          {mainShots.map((shot, index) => (
            <div key={shot.path || index} className="relative rounded-md overflow-hidden border border-white/10 bg-black/20 aspect-video">
              {shot.base64 ? (
                <img src={shot.base64} alt={`截图 ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] opacity-50">加载中...</div>
              )}
              <span className="absolute left-1.5 top-1.5 min-w-5 h-5 px-1 rounded bg-black/65 text-white text-[9px] flex items-center justify-center">
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {mainShots.length > 0 && searchShortcut && (
        <div className="mt-3 h-8 px-2.5 rounded-md flex items-center justify-between bg-cyan-500/10 border border-cyan-400/15 text-[9px]">
          <span className="flex items-center gap-1.5 text-cyan-300"><Search size={11} />截图已就绪</span>
          <span className="opacity-60">{formatAccelerator(searchShortcut)} 生成答案 · 最多 3 张</span>
        </div>
      )}

      {atLimit && (
        <div className="mt-2 text-[9px] leading-snug text-amber-300/90 bg-amber-500/10 border border-amber-500/15 rounded-md px-2.5 py-1.5">
          已达到 3 张上限，先搜题或删除最新截图，再继续截图。
        </div>
      )}
    </div>
  )
}
