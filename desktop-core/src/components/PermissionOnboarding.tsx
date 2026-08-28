import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, Mic, Monitor, Volume2 } from 'lucide-react';
import { api } from '../lib/ipc';
import type { PermissionCapabilityStatus, PermissionOnboardingState } from '../../shared/reliability';

interface PermissionOnboardingProps {
  onComplete: () => void;
}

const statusText: Record<PermissionCapabilityStatus, string> = {
  'not-determined': '尚未检查',
  granted: '系统已授权，等待实测',
  denied: '已拒绝，请到系统设置开启',
  restricted: '受系统策略限制',
  unavailable: '未获取到可用能力',
  'track-ready': '音轨可用，尚未检测到声音',
  verified: '已实测通过',
};

function Status({ value }: { value: PermissionCapabilityStatus }) {
  const good = value === 'verified';
  const warning = value === 'granted' || value === 'track-ready' || value === 'not-determined';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-rose-300'}`}>
      {good ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
      {statusText[value]}
    </span>
  );
}

export default function PermissionOnboarding({ onComplete }: PermissionOnboardingProps) {
  const [state, setState] = useState<PermissionOnboardingState | null>(null);
  const [busy, setBusy] = useState<'microphone' | 'screen' | 'system' | 'complete' | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.permissions.getState().then((value: unknown) => setState(value as PermissionOnboardingState)).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '读取权限状态失败');
    });
  }, []);

  const run = async (kind: 'microphone' | 'screen' | 'system') => {
    setBusy(kind);
    setError('');
    try {
      const next = kind === 'microphone'
        ? await api.permissions.requestMicrophone()
        : kind === 'screen'
          ? await api.permissions.requestScreen()
          : await api.permissions.testSystemAudio();
      setState(next as PermissionOnboardingState);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '权限检查失败');
    } finally {
      setBusy('');
    }
  };

  const finish = async (skipped: boolean) => {
    setBusy('complete');
    try {
      await api.permissions.complete(skipped);
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存权限状态失败');
    } finally {
      setBusy('');
    }
  };

  if (!state) {
    return <div className="flex h-screen items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} />正在检查 macOS 权限…</div>;
  }

  const verified = state.microphone === 'verified' && state.screen === 'verified' && state.systemAudio === 'verified';
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="border-l-4 border-amber-400 pl-5">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">首次启动检查</div>
          <h1 className="mt-2 text-2xl font-bold">先验证截图与听写权限</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">macOS 权限只能由你在系统提示或系统设置中确认，安装器无法代为静默授权。完成下面三项实测后再进入工作台，可避免使用功能时才发现黑屏或没有电脑声音。</p>
        </div>

        <div className="mt-8 space-y-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-slate-700 bg-slate-900/65 p-4">
            <Mic className="text-rose-300" size={20} />
            <div><div className="text-sm font-semibold">麦克风输入</div><div className="mt-1"><Status value={state.microphone} /></div><div className="mt-1 text-[11px] text-slate-500">点击后说一句话，应用会检测音轨和输入电平，不保存声音。</div></div>
            <div className="flex gap-2"><button className="btn-outline text-xs" onClick={() => api.permissions.openSettings('microphone')}>系统设置</button><button className="btn-primary text-xs" disabled={!!busy} onClick={() => run('microphone')}>{busy === 'microphone' && <Loader2 size={12} className="animate-spin" />}授权并测试</button></div>
          </div>

          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-slate-700 bg-slate-900/65 p-4">
            <Monitor className="text-cyan-300" size={20} />
            <div><div className="text-sm font-semibold">屏幕截图</div><div className="mt-1"><Status value={state.screen} /></div><div className="mt-1 text-[11px] text-slate-500">应用会请求屏幕录制权限并验证能取得非空屏幕图像。</div></div>
            <div className="flex gap-2"><button className="btn-outline text-xs" onClick={() => api.permissions.openSettings('screen')}>系统设置</button><button className="btn-primary text-xs" disabled={!!busy} onClick={() => run('screen')}>{busy === 'screen' && <Loader2 size={12} className="animate-spin" />}授权并测试</button></div>
          </div>

          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-slate-700 bg-slate-900/65 p-4">
            <Volume2 className="text-emerald-300" size={20} />
            <div><div className="text-sm font-semibold">电脑/扬声器声音</div><div className="mt-1"><Status value={state.systemAudio} /></div><div className="mt-1 text-[11px] text-slate-500">先播放一段音乐或视频，再点击测试。应用保留显示承载轨并检测系统音频电平。</div></div>
            <button className="btn-primary text-xs" disabled={!!busy} onClick={() => run('system')}>{busy === 'system' && <Loader2 size={12} className="animate-spin" />}测试电脑声音</button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">{error}</div>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="btn-ghost text-xs text-slate-500" disabled={!!busy} onClick={() => finish(true)}>稍后完成（能力保持未验证）</button>
          <button className="btn-primary" disabled={!verified || !!busy} onClick={() => finish(false)}>{busy === 'complete' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}全部实测通过，进入工作台</button>
        </div>
      </div>
    </div>
  );
}
