// 工作台 - 功能总览、快捷入口、积分/引流卡片
import { useNavigate } from 'react-router-dom';
import {
  PenLine, Mic, Chrome, Smartphone,
  Wallet, ArrowRight, Sparkles, TrendingUp, ShieldCheck, Zap, RefreshCw
} from 'lucide-react';
import { useState } from 'react';
import { api, useProfile, useUpdateStatus } from '../lib/ipc';
import { isMacPlatform } from '../../shared/shortcuts';
import CreditLedgerModal from '../components/CreditLedgerModal';

const MODULES = [
  { to: '/exam', title: isMacPlatform() ? '笔试助手' : 'PC笔试助手', desc: '截图搜题 · AI智能答题 · 多题批量解析', icon: <PenLine size={22} />, color: 'from-exam to-exam-dark', cost: '积分' },
  { to: '/interview', title: isMacPlatform() ? '面试助手' : 'PC面试助手', desc: '实时听写面试官问题 · AI秒出参考答案 · 隐身模式', icon: <Mic size={22} />, color: 'from-rose-500 to-rose-700', cost: '积分' },
  { to: '/companion', title: '双机协作笔面试', desc: '电脑截图与听写 · 手机查看题目和答案', icon: <Smartphone size={22} />, color: 'from-cyan-600 to-teal-700', cost: '积分' },
  { to: '/extension', title: 'AI 网申插件', desc: '简历识别 · 网申自动填写', icon: <Chrome size={22} />, color: 'from-indigo-500 to-indigo-700', cost: '永久免费' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const updateStatus = useUpdateStatus();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;
  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try { await api.update.check(); } finally { setCheckingUpdate(false); }
  };
  const updateText = updateStatus?.status === 'available'
    ? `发现新版本 ${updateStatus.version || ''}`
    : updateStatus?.status === 'not-available'
      ? `已是最新版本 ${updateStatus.currentVersion || ''}`
      : updateStatus?.status === 'error'
        ? (updateStatus.message || '检测失败，请重试')
        : updateStatus?.status === 'checking' || checkingUpdate
          ? '正在检测更新…'
          : '';

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* 欢迎横幅 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand/20 via-exam/10 to-transparent border border-slate-800 p-6">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1">你好，{acct?.nickname || acct?.email || '同学'} 👋</h1>
          <p className="text-sm text-slate-400 mb-4">从网申简历识别与自动填写，到笔试练习和面试准备，一套账号贯穿求职流程</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setLedgerOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700 hover:border-amber-400/60 transition-colors" title="查看当前账号积分明细">
              <Wallet size={16} className="text-amber-400" />
              <span className="text-sm">积分明细记录</span>
              <span className="text-xs text-amber-400">余额 {credits}</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('quizmate:open-recharge'))} className="btn-primary text-xs">
              <Zap size={14} /> 充值积分
            </button>
            <button onClick={() => navigate('/extension')} className="btn-outline text-xs">
              <Chrome size={14} /> 安装求职插件 <ArrowRight size={12} />
            </button>
            <button onClick={checkUpdate} disabled={checkingUpdate || updateStatus?.status === 'checking'} className="btn-outline text-xs">
              <RefreshCw size={14} className={checkingUpdate || updateStatus?.status === 'checking' ? 'animate-spin' : ''} /> 检测更新
            </button>
          </div>
          {updateText && <div className={`mt-2 text-xs ${updateStatus?.status === 'error' ? 'text-rose-400' : updateStatus?.status === 'available' ? 'text-amber-300' : 'text-slate-400'}`}>{updateText}</div>}
        </div>
        <div className="absolute right-4 top-4 text-7xl opacity-10">🎯</div>
      </div>

      {/* 核心优势 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card flex items-start gap-3">
          <ShieldCheck size={20} className="text-emerald-400 mt-0.5" />
          <div>
            <div className="text-sm font-medium">隐身保护</div>
            <div className="text-xs text-slate-400 mt-1">面试/笔试窗口对屏幕共享与录屏不可见，安心使用</div>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <Sparkles size={20} className="text-brand mt-0.5" />
          <div>
            <div className="text-sm font-medium">统一账号</div>
            <div className="text-xs text-slate-400 mt-1">与官网/考试插件共用积分、充值、登录，一处充值多处可用</div>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <TrendingUp size={20} className="text-accent mt-0.5" />
          <div>
            <div className="text-sm font-medium">网申自动化</div>
            <div className="text-xs text-slate-400 mt-1">网申插件提供简历识别与字段自动填写，永久免费使用</div>
          </div>
        </div>
      </div>

      {/* 功能模块网格 */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-brand rounded-full" /> 全部功能
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map((m) => (
            <button
              key={m.to}
              data-assistant-route={m.to}
              onClick={() => navigate(m.to)}
              className="group card text-left hover:border-brand/50 hover:bg-slate-900 transition-all relative overflow-hidden"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white mb-3 shadow-lg`}>
                {m.icon}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm">{m.title}</h3>
                <span className={`tag ${m.cost.includes('免费') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{m.cost}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
              <ArrowRight size={16} className="absolute right-3 bottom-3 text-slate-600 group-hover:text-brand group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>
      </div>

      {/* 插件引流提示 */}
      <div className="card bg-gradient-to-r from-indigo-500/5 to-transparent border-indigo-500/20">
        <div className="flex items-center gap-3 flex-wrap">
          <Chrome size={18} className="text-indigo-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">QuizMate AI 网申自动化插件</div>
            <div className="text-xs text-slate-400">AI 网申自动化：识别简历并自动填写网申字段，永久免费使用</div>
          </div>
          <button onClick={() => navigate('/extension')} className="btn-outline text-xs">安装插件 <ArrowRight size={12} /></button>
        </div>
      </div>
      <CreditLedgerModal open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}
