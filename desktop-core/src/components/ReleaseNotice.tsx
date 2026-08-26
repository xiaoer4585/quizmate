import { Megaphone, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export const RELEASE_NOTICE_VERSION = '2026.8.18';
const STORAGE_KEY = 'quizmate.releaseNotice.version';

export function shouldShowReleaseNotice(appVersion: string, seenVersion: string | null): boolean {
  return appVersion === RELEASE_NOTICE_VERSION && seenVersion !== RELEASE_NOTICE_VERSION;
}

export default function ReleaseNotice({ appVersion }: { appVersion: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!appVersion) return;
    setOpen(shouldShowReleaseNotice(appVersion, localStorage.getItem(STORAGE_KEY)));
  }, [appVersion]);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, RELEASE_NOTICE_VERSION);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-labelledby="release-notice-title">
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-amber-400/40 bg-slate-950 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-400/15 text-amber-300">
            <Megaphone size={21} />
          </div>
          <div>
            <div className="text-xs text-amber-300">QuizMate v{RELEASE_NOTICE_VERSION}</div>
            <h2 id="release-notice-title" className="text-lg font-semibold text-white">重磅更新</h2>
          </div>
          <button type="button" onClick={close} className="ml-auto p-1.5 text-slate-400 hover:text-white" title="关闭更新通知">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-300">1</span>
            <div>
              <div className="font-medium text-slate-100">操作指引</div>
              <p className="mt-1 text-sm leading-6 text-slate-400">便于新手快速入门操作。</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-semibold text-emerald-300">2</span>
            <div>
              <div className="font-medium text-slate-100">面试助手更新上线</div>
              <p className="mt-1 text-sm leading-6 text-slate-400">全面提升响应速度，每个问题仅消耗 20 积分，回复更便宜，速速体验。</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/60 px-5 py-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Sparkles size={13} /> 本通知仅在本版本首次启动时显示</div>
          <button type="button" onClick={close} className="btn-primary text-sm">知道了，立即体验</button>
        </div>
      </div>
    </div>
  );
}
