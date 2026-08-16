// 个人中心 - 账号信息、积分、充值入口、邀请代理
import { User, Mail, Wallet, Zap, RefreshCw, ShieldCheck, LogOut } from 'lucide-react';
import { api, useProfile } from '../lib/ipc';
import InviteAgent from '../components/InviteAgent';

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const { data: profile, refetch } = useProfile();

  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;
  const cost = profile?.costPerSuccess ?? 10;

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
            <button onClick={() => api.system.openRecharge()} className="btn bg-amber-500 hover:bg-amber-600 text-white">
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

      {/* 关于 */}
      <div className="card bg-slate-900/40">
        <div className="flex items-center gap-2 text-sm font-medium mb-2"><ShieldCheck size={16} className="text-emerald-400" /> 隐身保护</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          笔试与面试悬浮窗已启用 macOS 内容保护、鼠标穿透与非激活显示。不同 macOS 和会议软件版本的捕获机制不同，正式使用前请先在目标共享软件中验证一次。
        </p>
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
