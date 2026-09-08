import { useEffect, useState } from 'react';
import { Smartphone, Mic, Camera, Monitor, Link2 } from 'lucide-react';
import { api } from '../lib/ipc';
import ShortcutSettings from '../components/ShortcutSettings';
import { defaultShortcutBindings, formatAccelerator } from '../../shared/shortcuts';
import type { CompanionState } from '../../shared/mobile-companion';

export default function Companion() {
  const [state, setState] = useState<CompanionState>({ workspace: 'pc', transitioning: false, connected: false, listening: false, capturing: false, pending: 0 });
  const [bindings, setBindings] = useState<Record<string, string>>(defaultShortcutBindings);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopWorkspace = async () => {
    if (stopping) return;
    setStopping(true); setError('');
    try { await api.companion.workspace('pc'); setState(await api.companion.getState()); }
    catch (e) { setError(e instanceof Error ? e.message : '停止失败，请重试'); }
    finally { setStopping(false); }
  };
  const [error, setError] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); setState(await api.companion.getState()); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    api.companion.getState().then((value: CompanionState) => { if (alive) { setState(value); setServiceUrl(value.serviceUrl || ''); } }).catch((e: Error) => setError(e.message));
    api.exam.getShortcutBindings().then(setBindings);
    const off = api.companion.onState((value: CompanionState) => setState(value));
    const offError = api.companion.onError((value: string) => setError(value));
    return () => { alive = false; off(); offError(); };
  }, []);
  const mobile = state.workspace === 'mobile';
  return <div className="max-w-5xl mx-auto space-y-5">
    <div className="flex items-start gap-4">
      <Smartphone className="text-cyan-400 mt-1" size={32}/>
      <div><h1 className="text-2xl font-semibold">双机协作笔面试</h1><p className="text-sm text-slate-400 mt-2">电脑采集问题，手机阅读答案。笔试截图和面试听写可以同时使用。</p></div>
    </div>
    <div className="card flex items-center justify-between gap-4">
      <div><div className="font-semibold">当前工作区：{mobile ? '双机协作' : 'PC 助手'}</div><p className="text-sm text-slate-400 mt-1">{mobile ? '快捷键仅操作手机笔面试。' : 'PC 笔试和 PC 面试保持原有快捷键行为。'}</p></div>
      <button disabled={mobile ? stopping : busy || !state.connected} className={mobile ? 'btn-primary !bg-red-600 hover:!bg-red-500' : 'btn-primary !bg-emerald-600 hover:!bg-emerald-500'} onClick={() => mobile ? stopWorkspace() : run(() => api.companion.workspace('mobile'))}><Monitor size={16}/>{mobile ? '停止双机协作' : '开始双机协作'}</button>
    </div>
    {(error || state.error) && <div role="alert" className="card border-amber-500/40 text-amber-200 text-sm">{error || state.error}</div>}
    <div className="grid md:grid-cols-[300px_1fr] gap-5">
      <section className="card space-y-4">
        <h2 className="font-semibold flex gap-2 items-center"><Link2 size={18}/>连接手机</h2>
        <label className="block text-sm text-slate-400">手机测试服务地址<input aria-label="手机测试服务地址" value={serviceUrl} disabled={busy || !!state.code} onChange={e => setServiceUrl(e.target.value)} placeholder="https://测试服务地址/" className="mt-2 w-full rounded bg-slate-900 p-2 border border-slate-700"/></label>
        <button className="btn-outline" disabled={busy || !!state.code || !serviceUrl} onClick={() => run(() => api.companion.setServiceUrl(serviceUrl))}>保存地址</button>
        {state.qr ? <><img src={state.qr} alt="手机连接二维码" className="w-48 h-48 rounded-lg bg-white"/><div className="text-3xl tracking-widest font-mono">{state.code}</div><p className="text-xs text-slate-400 break-all">{state.phoneUrl}</p></> : <p className="text-sm text-slate-400 leading-7">生成连接码后，用手机打开连接页面，登录同一账号并配对。</p>}
        <p className={state.connected ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{state.connected ? '手机已连接' : state.code ? '等待手机连接' : '尚未连接'}</p>
        <div className="flex gap-2"><button disabled={busy || mobile} className="btn-outline" onClick={() => run(() => api.companion.pair())}>{state.code ? '重新配对' : '生成连接码'}</button>{state.code && <button disabled={busy} className="btn-ghost" onClick={() => run(() => api.companion.disconnect())}>断开</button>}</div>
      </section>
      <div className="space-y-4">
        <section className="card space-y-3"><h2 className="font-semibold flex gap-2 items-center"><Camera size={18}/>手机笔试</h2><p className="text-sm text-slate-400 leading-7">按 <b className="text-cyan-300">{formatAccelerator(bindings.screenshot)}</b> 截取当前屏幕并自动搜题，手机显示题目简介、答案和解析。</p><button disabled={busy || !mobile || state.capturing} className="btn-outline" onClick={() => run(() => api.companion.screenshot())}>{state.capturing ? '正在处理…' : '截图并搜题'}</button></section>
        <section className="card space-y-3"><h2 className="font-semibold flex gap-2 items-center"><Mic size={18}/>手机面试</h2><p className="text-sm text-slate-400 leading-7">按 <b className="text-cyan-300">{formatAccelerator(bindings.interview_start)}</b> 或点击按钮开始/停止听写。沿用 PC 面试页保存的岗位和简历设置。</p><div className="flex gap-2"><button disabled={busy} className={(state.audioMode || 'demo') === 'demo' ? 'btn-outline !bg-amber-500 !text-slate-950' : 'btn-outline'} onClick={() => run(() => api.companion.setAudioMode('demo'))}>演示模式</button><button disabled={busy} className={state.audioMode === 'formal' ? 'btn-outline !bg-emerald-500 !text-slate-950' : 'btn-outline'} onClick={() => run(() => api.companion.setAudioMode('formal'))}>正式面试模式</button></div>
        <p className={`text-sm p-3 rounded ${(state.audioMode || 'demo') === 'demo' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{(state.audioMode || 'demo') === 'demo' ? '演示模式：识别麦克风 + 扬声器，作为问题输入' : '正式面试模式：只识别扬声器（面试官问题）'}</p>
        <button disabled={busy || !mobile} className={state.listening ? 'btn-primary !bg-red-600 hover:!bg-red-500' : 'btn-primary !bg-emerald-600 hover:!bg-emerald-500'} onClick={() => run(() => api.companion.interview())}>{state.listening ? '结束面试' : '开始面试'}</button></section>
        <p className="text-xs text-slate-400">待同步 {state.pending} 条 · 答案阅读和同步不额外扣积分，AI 分析沿用原积分规则。</p>
      </div>
    </div>
    <ShortcutSettings commonActions={['screenshot', 'interview_start']} bindings={bindings} onBindingsChange={setBindings} accentClass="bg-cyan-600"/>
  </div>;
}
