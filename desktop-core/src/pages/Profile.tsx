// 个人中心 - 账号信息、积分、充值入口、邀请代理
import { useEffect, useState } from 'react';
import { User, Mail, Wallet, Zap, RefreshCw, ShieldCheck, LogOut, EyeOff, RotateCcw } from 'lucide-react';
import { api, useProfile } from '../lib/ipc';
import { isMacPlatform } from '../../shared/shortcuts';
import InviteAgent from '../components/InviteAgent';
import RechargeModal from '../components/RechargeModal';

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const { data: profile, refetch } = useProfile();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [hideAppChromeOnMinimize, setHideAppChromeOnMinimize] = useState(true);

  useEffect(() => {
    api.config.getClientSettings()
      .then((settings: { hideAppChromeOnMinimize?: boolean }) => {
        setHideAppChromeOnMinimize(settings.hideAppChromeOnMinimize !== false);
      })
      .catch(() => {});
  }, []);

  const updateHideAppChrome = async (enabled: boolean) => {
    setHideAppChromeOnMinimize(enabled);
    await api.config.updateClientSettings({ hideAppChromeOnMinimize: enabled });
  };

  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;
  const cost = profile?.costPerSuccess ?? 10;

  const handleRecharge = () => {
    setRechargeOpen(true);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2"><User size={22} className="text-brand" /> 个人中心</h1>

      {/* 账号卡片 */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand to-exam flex items-center justify-center text-white text-xl font-bold">
            {(acct?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-base">{acct?.nickname || acct?.email || '未登录'}</div>
            <div className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Mail size={12} /> {acct?.email || '-'}
            </div>
            {acct?.vipLevel && acct.vipLevel > 0 && (
              <span className="tag bg-accent/15 text-accent mt-1">VIP {acct.vipLevel}</span>
            )}
          </div>
        </div>
      </div>

      {/* 积分卡片 */}
      <div className="card bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
              <Wallet size={22} />
            </div>
            <div>
              <div className="text-xs text-slate-400">积分余额</div>
              <div className="text-2xl font-bold text-amber-400">{credits}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRecharge} className="btn bg-amber-500 hover:bg-amber-600 text-white">
              <Zap size={16} /> 充值积分
            </button>
            <button onClick={() => refetch()} className="btn-ghost text-xs">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-amber-500/10 text-xs text-slate-400">
          积分与官网和考试助手通用，一处充值多处可用。每次笔试答题成功消耗 {cost} 积分，面试助手按使用量消耗。
        </div>
      </div>

      {/* 邀请代理 */}
      <InviteAgent />

      {/* 充值弹窗 */}
      <RechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />

      {/* 关于 */}
      <div className="card bg-slate-900/40">
        <div className="flex items-center gap-2 text-sm font-medium mb-2"><ShieldCheck size={16} className="text-emerald-400" /> 隐身保护</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {isMacPlatform()
            ? '笔试与面试窗口已启用 macOS 内容保护、透明背景、非激活显示与鼠标穿透，不使用会产生黑块的遮罩。macOS 15+ 的部分 ScreenCaptureKit 采集方式可能绕过系统保护，正式使用前请在目标录屏或投屏软件中验证。'
            : '笔试与面试窗口已启用 Windows 隐身保护（SetWindowDisplayAffinity），对屏幕共享、录屏软件、远程桌面不可见，可放心使用。'}
        </p>
      </div>

      <div className="card border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <EyeOff size={18} className="mt-0.5 text-amber-300" />
            <div>
              <div className="text-sm font-medium text-amber-200">最小化后隐藏任务栏与托盘</div>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                {hideAppChromeOnMinimize
                  ? '已开启：点击最小化后，客户端窗口、任务栏图标和托盘图标都会隐藏。按 ⌘⇧⌥M（Windows 为 Ctrl+Alt+Shift+M），或再次启动 QuizMate，即可恢复。'
                  : '已关闭：最小化后保留任务栏和托盘图标。'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hideAppChromeOnMinimize}
            onClick={() => updateHideAppChrome(!hideAppChromeOnMinimize)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${hideAppChromeOnMinimize ? 'bg-amber-500' : 'bg-slate-600'}`}
            title="切换最小化隐藏策略"
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${hideAppChromeOnMinimize ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <button type="button" onClick={() => api.system.restoreMainWindow()} className="btn-ghost mt-3 text-xs text-amber-200">
          <RotateCcw size={14} /> 立即恢复客户端窗口
        </button>
      </div>

      {/* 退出登录 */}
      <div className="flex justify-center pt-2">
        <button
          onClick={async () => { await api.auth.logout(); onLogout(); }}
          className="btn-outline text-sm text-rose-400 hover:bg-rose-500/15"
        >
          <LogOut size={16} /> 退出登录
        </button>
      </div>
    </div>
  );
}
