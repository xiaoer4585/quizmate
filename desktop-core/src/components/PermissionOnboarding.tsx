import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, Mic, Monitor, ShieldCheck, Volume2 } from 'lucide-react';
import { api } from '../lib/ipc';
import type { PermissionCapabilityStatus, PermissionOnboardingState } from '../../shared/reliability';

interface PermissionOnboardingProps {
  onComplete: () => void;
}

const statusText: Record<PermissionCapabilityStatus, string> = {
  'not-determined': '等待系统授权',
  granted: '系统已授权，正在自动验证',
  denied: '尚未允许',
  restricted: '受系统策略限制',
  unavailable: '暂未取得可用音轨',
  'track-ready': '已授权，音轨可用（当前静音）',
  verified: '已授权并自动验证',
};

const phaseText: Record<string, string> = {
  idle: '准备开始',
  migrating: '正在清理旧版本权限记录…',
  microphone: '正在申请并验证麦克风…',
  screen: '正在申请并验证屏幕录制…',
  'system-audio': '正在申请并验证电脑声音…',
  'waiting-settings': '请在已打开的系统设置中允许 QuizMate',
  'restart-required': '系统权限已变更，需要重启 QuizMate 后继续',
  complete: '全部权限已准备完成',
  failed: '权限准备未完成',
};

function Status({ value }: { value: PermissionCapabilityStatus }) {
  const good = value === 'verified' || value === 'track-ready';
  const warning = value === 'granted' || value === 'not-determined';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-rose-300'}`}>
      {good ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
      {statusText[value]}
    </span>
  );
}

export default function PermissionOnboarding({ onComplete }: PermissionOnboardingProps) {
  const [state, setState] = useState<PermissionOnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resumedRef = useRef(false);

  const refresh = async () => {
    const next = await api.permissions.getState() as PermissionOnboardingState;
    setState(next);
    if (next.completed) onComplete();
    return next;
  };

  const authorizeAll = async (automatic = false) => {
    if (busy) return;
    setBusy(true);
    if (!automatic) setError('');
    try {
      const next = await api.permissions.authorizeAll() as PermissionOnboardingState;
      setState(next);
      if (next.completed) onComplete();
      else if (next.errorCode) setError(next.errorCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '统一授权未完成');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    refresh().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '读取权限状态失败');
    });
    const timer = window.setInterval(() => {
      api.permissions.getState().then((value: unknown) => {
        if (cancelled) return;
        const next = value as PermissionOnboardingState;
        setState(next);
        if (next.completed) onComplete();
        const returnedFromSettings = (next.authorizationPhase === 'waiting-settings' || next.authorizationPhase === 'restart-required')
          && (next.microphone === 'granted' || next.screen === 'granted' || next.screen === 'verified');
        if (returnedFromSettings && !resumedRef.current && !next.requiresRestart) {
          resumedRef.current = true;
          void authorizeAll(true);
        }
      }).catch(() => {});
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // authorizeAll is intentionally invoked only once by the guarded resume path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) {
    return <div className="flex h-screen items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} />正在准备 macOS 权限…</div>;
  }

  const installRequired = state.migrationStatus === 'install-required';
  const restartRequired = state.requiresRestart || state.authorizationPhase === 'restart-required';
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="border-l-4 border-cyan-400 pl-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck size={15} />安装后统一授权</div>
          <h1 className="mt-2 text-2xl font-bold">一次完成 QuizMate 所需权限</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            QuizMate 会在安装替换后的首次启动中清理旧版本权限记录。点击一次后，macOS 会依次显示必要的系统确认；应用将在后台自动验证，不需要逐项测试或播放声音。
          </p>
        </div>

        <div className="mt-7 rounded-xl border border-slate-700 bg-slate-900/65 p-4">
          <div className="flex items-center gap-3 text-sm">
            {(busy || state.authorizationPhase === 'migrating') ? <Loader2 className="animate-spin text-cyan-300" size={18} /> : <ShieldCheck className="text-cyan-300" size={18} />}
            <span>{phaseText[state.authorizationPhase ?? 'idle'] ?? '正在检查权限'}</span>
          </div>
          {state.migrationStatus === 'completed' && <div className="mt-2 text-xs text-emerald-300">旧版本权限记录已完成一次性迁移，后续启动不会重复清理。</div>}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/65 p-4"><Mic className="mb-3 text-rose-300" size={20} /><div className="text-sm font-semibold">麦克风</div><div className="mt-2"><Status value={state.microphone} /></div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/65 p-4"><Monitor className="mb-3 text-cyan-300" size={20} /><div className="text-sm font-semibold">屏幕截图</div><div className="mt-2"><Status value={state.screen} /></div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/65 p-4"><Volume2 className="mb-3 text-emerald-300" size={20} /><div className="text-sm font-semibold">电脑声音</div><div className="mt-2"><Status value={state.systemAudio} /></div></div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">权限代码：{error}</div>}

        <div className="mt-6 flex items-center justify-end gap-3">
          {installRequired ? (
            <button className="btn-primary" disabled={busy} onClick={() => api.permissions.installToApplications()}><ShieldCheck size={14} />安装到“应用程序”并继续</button>
          ) : restartRequired ? (
            <button className="btn-primary" disabled={busy} onClick={() => api.permissions.relaunch()}><Loader2 size={14} />立即重启并继续授权</button>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => authorizeAll(false)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}开始授权</button>
          )}
        </div>
      </div>
    </div>
  );
}
