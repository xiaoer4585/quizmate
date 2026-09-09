import { useEffect, useState } from 'react';
import { Smartphone, Mic, Camera, Link2 } from 'lucide-react';
import { api } from '../lib/ipc';
import type { CompanionState } from '../../shared/mobile-companion';
import { defaultShortcutBindings, formatAccelerator } from '../../shared/shortcuts';

export default function Companion() {
  const [state, setState] = useState<CompanionState>({ workspace: 'pc', transitioning: false, connected: false, listening: false, capturing: false, pending: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shortcuts, setShortcuts] = useState<Record<string, string>>(defaultShortcutBindings);
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); setState(await api.companion.getState()); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    api.companion.getState().then((value: CompanionState) => { if (alive) { setState(value); } }).catch((e: Error) => setError(e.message));
    api.exam.getShortcutBindings?.().then((value: Record<string, string>) => { if (alive) setShortcuts(value); }).catch(() => {});
    const off = api.companion.onState((value: CompanionState) => setState(value));
    const offError = api.companion.onError((value: string) => setError(value));
    return () => { alive = false; off(); offError(); };
  }, []);
  const mobile = state.workspace === 'mobile';
  const pairingCode = state.code || state.phoneUrl?.match(/#(?:[^#]*&)?code=(\d{6})/)?.[1];
  return <div className="max-w-5xl mx-auto space-y-5">
    <div className="flex items-start gap-4">
      <Smartphone className="text-cyan-400 mt-1" size={32}/>
      <div><h1 className="text-2xl font-semibold">双机协作笔面试</h1><p className="text-sm text-slate-400 mt-2">电脑采集问题，手机阅读答案。笔试截图和面试听写可以同时使用。</p></div>
    </div>
    <div className={`card border ${mobile ? 'border-emerald-500/40' : 'border-amber-500/40'}`}>
      <div className="font-semibold">当前工作区：{mobile ? '双机协作（进行中）' : 'PC 助手'}</div>
      <p className="text-sm text-slate-400 mt-1">{mobile ? '进入本菜单即自动启用；快捷键只操作手机端，不会启动 PC 悬浮框。' : '进入本菜单后会自动切换到双机协作。'}</p>
    </div>
    {(error || state.error) && <div role="alert" className="card border-amber-500/40 text-amber-200 text-sm">{error || state.error}</div>}
    <div className="grid md:grid-cols-[300px_1fr] gap-5">
      <section className="card space-y-4">
        <h2 className="font-semibold flex gap-2 items-center"><Link2 size={18}/>连接手机</h2>
        <p className={state.connected ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{state.connected ? '手机已连接' : pairingCode ? '等待手机连接' : '尚未连接'}</p>
        {pairingCode && <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
          <div className="text-xs text-cyan-200/80">手机连接码</div>
          <div className="mt-1 select-all text-center font-mono text-3xl font-bold tracking-[0.32em] text-cyan-100">{pairingCode}</div>
          <div className="mt-1 text-center text-xs text-slate-400">扫码无法使用时，可在手机页面输入此 6 位连接码</div>
        </div>}
        {state.qr && <div className="rounded-xl border border-slate-700 bg-white p-3 shadow-inner">
          <img src={state.qr} alt="手机配对二维码" className="mx-auto block h-56 w-56" />
          <p className="mt-2 text-center text-xs text-slate-500">使用手机相机扫码即可连接</p>
        </div>}
        <div className="flex gap-2"><button disabled={busy} className="btn-outline" onClick={() => run(() => api.companion.pair())}>{pairingCode ? '重新配对' : '生成连接码'}</button>{pairingCode && <button disabled={busy} className="btn-ghost" onClick={() => run(() => api.companion.disconnect())}>断开</button>}</div>
      </section>
      <div className="space-y-4">
        <section className="card space-y-3"><h2 className="font-semibold flex gap-2 items-center"><Camera size={18}/>手机笔试</h2><p className="text-sm text-slate-400 leading-7">通过快捷键控制，电脑全屏截图后在手机端搜题；长题可以连续截图，最后再搜题。</p><div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm"><div><b className="text-cyan-300">{formatAccelerator(shortcuts.screenshot || defaultShortcutBindings.screenshot)}</b>　截图</div><div><b className="text-cyan-300">{formatAccelerator(shortcuts.search || defaultShortcutBindings.search)}</b>　搜题</div><div><b className="text-cyan-300">{formatAccelerator(shortcuts.copy_content || defaultShortcutBindings.copy_content)}</b>　复制手机答案到电脑剪贴板</div></div><p className="text-xs text-slate-400">操作顺序：先截图，再搜题；题目过长时可多次截图，完成后按搜题。</p></section>
        <section className="card space-y-3"><h2 className="font-semibold flex gap-2 items-center"><Mic size={18}/>手机面试</h2><p className="text-sm text-slate-400 leading-7">需点击下面的“开始面试”启动，面试快捷键不会在双机模式下生效。沿用 PC 面试页保存的岗位和简历设置。</p><div className="flex gap-2"><button disabled={busy} className={(state.audioMode || 'demo') === 'demo' ? 'btn-outline !bg-amber-500 !text-slate-950' : 'btn-outline'} onClick={() => run(() => api.companion.setAudioMode('demo'))}>演示模式</button><button disabled={busy} className={state.audioMode === 'formal' ? 'btn-outline !bg-emerald-500 !text-slate-950' : 'btn-outline'} onClick={() => run(() => api.companion.setAudioMode('formal'))}>正式面试模式</button></div>
        <p className={`text-sm p-3 rounded ${(state.audioMode || 'demo') === 'demo' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{(state.audioMode || 'demo') === 'demo' ? '演示模式：识别麦克风 + 扬声器，作为问题输入' : '正式面试模式：只识别扬声器（面试官问题）'}</p>
        <button disabled={busy || !mobile} className={state.listening ? 'btn-primary !bg-red-600 hover:!bg-red-500' : 'btn-primary !bg-emerald-600 hover:!bg-emerald-500'} onClick={() => run(() => api.companion.interview())}>{state.listening ? '结束面试' : '开始面试'}</button></section>
        <p className="text-xs text-slate-400">待同步 {state.pending} 条 · 答案阅读和同步不额外扣积分，AI 分析沿用原积分规则。</p>
      </div>
    </div>
  </div>;
}
