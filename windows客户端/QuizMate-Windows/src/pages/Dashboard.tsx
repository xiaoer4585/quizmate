// 工作台 - 功能总览、快捷入口、积分/引流卡片
import { useNavigate } from 'react-router-dom';
import {
  PenLine, Mic, Chrome,
  Wallet, ArrowRight, Sparkles, TrendingUp, ShieldCheck, Zap
} from 'lucide-react';
import { api, useProfile, useConfig } from '../lib/ipc';

const MODULES = [
  { to: '/exam', title: '笔试助手', desc: '截图搜题 · AI智能答题 · 多题批量解析', icon: <PenLine size={22} />, color: 'from-exam to-exam-dark', cost: '积分' },
  { to: '/interview', title: '面试助手', desc: '实时听写面试官问题 · AI秒出参考答案 · 隐身模式', icon: <Mic size={22} />, color: 'from-rose-500 to-rose-700', cost: '积分' },
  { to: '/extension', title: '求职浏览器插件', desc: 'AI 网申 · 投递管理 · 职位监控', icon: <Chrome size={22} />, color: 'from-indigo-500 to-indigo-700', cost: '免费' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: config } = useConfig();
  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* 欢迎横幅 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand/20 via-exam/10 to-transparent border border-slate-800 p-6">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1">你好，{acct?.nickname || acct?.email || '同学'} 👋</h1>
          <p className="text-sm text-slate-400 mb-4">专注笔试截图答题与面试实时辅助，求职流程交给免费浏览器插件</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700">
              <Wallet size={16} className="text-amber-400" />
              <span className="text-sm">积分余额</span>
              <span className="text-amber-400 font-bold">{credits}</span>
            </div>
            <button onClick={() => api.system.openRecharge()} className="btn-primary text-xs">
              <Zap size={14} /> 充值积分
            </button>
            <button onClick={() => navigate('/extension')} className="btn-outline text-xs">
              <Chrome size={14} /> 安装求职插件 <ArrowRight size={12} />
            </button>
          </div>
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
            <div className="text-sm font-medium">免费引流</div>
            <div className="text-xs text-slate-400 mt-1">免费插件提供 AI 网申、投递管理与职位监控</div>
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
              onClick={() => navigate(m.to)}
              className="group card text-left hover:border-brand/50 hover:bg-slate-900 transition-all relative overflow-hidden"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white mb-3 shadow-lg`}>
                {m.icon}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm">{m.title}</h3>
                <span className={`tag ${m.cost === '免费' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{m.cost}</span>
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
            <div className="text-sm font-medium">QuizMate 求职浏览器插件 · 完全免费</div>
            <div className="text-xs text-slate-400">AI 网申 · 投递管理 · 职位监控，覆盖浏览器内的求职流程</div>
          </div>
          <button onClick={() => navigate('/extension')} className="btn-outline text-xs">安装插件 <ArrowRight size={12} /></button>
        </div>
      </div>
    </div>
  );
}
