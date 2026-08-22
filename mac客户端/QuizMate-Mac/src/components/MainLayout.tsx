// 主框架布局 - 左侧导航 + 顶部状态栏 + 内容区
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PenLine, Mic,
  User, Wallet, Menu, X,
  Download, Loader2, CheckCircle2, AlertCircle, BookOpen, Chrome, HelpCircle
} from 'lucide-react';
import { api, useProfile, useUpdateStatus } from '../lib/ipc';
import ReleaseNotice from './ReleaseNotice';
import RechargeModal from './RechargeModal';

interface NavItem { to: string; label: string; icon: ReactNode; badge?: string; }

const NAV: NavItem[] = [
  { to: '/', label: '工作台', icon: <LayoutDashboard size={18} /> },
  { to: '/exam', label: '笔试助手', icon: <PenLine size={18} />, badge: '积分' },
  { to: '/interview', label: '面试助手', icon: <Mic size={18} />, badge: '积分' },
  { to: '/extension', label: '浏览器插件', icon: <Chrome size={18} />, badge: '免费' },
];

export default function MainLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [version, setVersion] = useState('');
  const updateStatus = useUpdateStatus();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  useEffect(() => { api.system.getAppVersion().then(setVersion).catch(() => {}); }, []);

  // 运营入口：未充值邀请用户或积分不足时统一打开客户端充值弹窗。
  useEffect(() => {
    const openRecharge = () => setRechargeOpen(true);
    window.addEventListener('quizmate:open-recharge', openRecharge);
    const offRecharge = api.system.onShowRechargeModal?.(openRecharge);
    const offCredits = (window as any).electronAPI?.on?.('out-of-credits', openRecharge);
    return () => {
      window.removeEventListener('quizmate:open-recharge', openRecharge);
      offRecharge?.();
      offCredits?.();
    };
  }, []);

  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;

  // ===== 版本更新提示 =====
  const updateKey = updateStatus ? `${updateStatus.status}:${updateStatus.version ?? updateStatus.message ?? ''}` : null;
  const canDismissUpdate = updateStatus?.status === 'available';
  const updateDismissed = canDismissUpdate && updateKey === dismissedKey;
  const showUpdateBanner = !!updateStatus && !updateDismissed &&
    ['available', 'downloading', 'downloaded'].includes(updateStatus.status);
  const handleUpdateClick = () => api.update.download();
  const handleRetryUpdate = () => api.update.check();
  const handleDismissUpdate = () => setDismissedKey(updateKey);
  const openGuide = () => {
    if (location.pathname === '/exam' || location.pathname === '/interview') {
      window.dispatchEvent(new CustomEvent('quizmate:open-feature-guide', { detail: { page: location.pathname.slice(1) } }));
      return;
    }
    navigate('/exam?guide=1');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* 侧边栏 */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-slate-900/80 border-r border-slate-800 flex flex-col transition-all`}>
        <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-exam flex items-center justify-center font-bold text-white">Q</div>
          {!collapsed && <div className="font-semibold text-sm">QuizMate</div>}
          <button className="ml-auto text-slate-400 hover:text-slate-100" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-brand/15 text-brand' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
              title={item.label}
            >
              {item.icon}
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className={`tag ${item.badge === '免费' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-slate-800 space-y-1">
          <button onClick={() => navigate('/profile')} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">
            <User size={18} /> {!collapsed && '个人中心'}
          </button>
        </div>
      </aside>

      {/* 主体 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 版本更新提示横幅 */}
        {showUpdateBanner && (
          <div
            className={`flex items-center gap-3 px-5 h-10 text-sm text-white shadow-md ${
              updateStatus?.status === 'available'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600'
                : updateStatus?.status === 'downloading'
                ? 'bg-gradient-to-r from-sky-700 to-blue-700'
                : updateStatus?.status === 'downloaded'
                ? 'bg-gradient-to-r from-emerald-700 to-green-700'
                : 'bg-rose-700'
            }`}
          >
            {updateStatus?.status === 'available' && (
              <>
                <Download size={16} className="shrink-0" />
                <span className="shrink-0">
                  发现新版本 <b>v{updateStatus.version}</b>，当前 v{updateStatus.currentVersion}
                </span>
                <button
                  onClick={handleUpdateClick}
                  className="ml-1 px-3 py-0.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors font-medium text-xs shrink-0"
                >
                  浏览器下载安装包
                </button>
                <button
                  onClick={handleDismissUpdate}
                  className="ml-auto p-1 rounded hover:bg-white/20 transition-colors shrink-0"
                  title="稍后再说"
                >
                  <X size={14} />
                </button>
              </>
            )}
            {updateStatus?.status === 'downloading' && (
              <>
                <Loader2 size={16} className="shrink-0 animate-spin" />
                <span className="shrink-0">正在下载更新… {Math.round(updateStatus.percent ?? 0)}%</span>
                <div className="flex-1 max-w-xs h-1.5 bg-white/25 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-200"
                    style={{ width: `${updateStatus.percent ?? 0}%` }}
                  />
                </div>
              </>
            )}
            {updateStatus?.status === 'downloaded' && (
              <>
                <CheckCircle2 size={16} className="shrink-0" />
                <span>安装包已下载，请打开 DMG 并覆盖安装</span>
              </>
            )}
            {updateStatus?.status === 'error' && (
              <>
                <AlertCircle size={16} className="shrink-0" />
                <span className="shrink-0">更新检测失败：{updateStatus.message}</span>
                <button
                  onClick={handleRetryUpdate}
                  className="ml-1 px-3 py-0.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors font-medium text-xs shrink-0"
                >
                  重试
                </button>
                <button
                  onClick={handleDismissUpdate}
                  className="ml-auto p-1 rounded hover:bg-white/20 transition-colors shrink-0"
                  title="关闭"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        )}
        {/* 顶栏 */}
        <header className="h-14 flex items-center gap-3 px-5 border-b border-slate-800 bg-slate-900/50">
          <div className="text-sm text-slate-400">QuizMate 考试助手 · 笔试与面试实时辅助</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => api.system.openExternal('https://quizmate.cn/docs.html')}
              className="btn-outline text-xs flex items-center gap-1.5"
              title="操作文档"
            >
              <BookOpen size={14} /> 操作文档
            </button>
            <button onClick={openGuide} className="btn-outline text-xs flex items-center gap-1.5" title="重新打开操作指引">
              <HelpCircle size={14} /> 操作指引
            </button>
            <button onClick={() => setRechargeOpen(true)} className="btn-outline text-xs" title="充值积分">
              <Wallet size={14} /> <span className="text-amber-400 font-semibold">{credits}</span> 积分
            </button>
            <div className="text-xs text-slate-500 ml-2">{acct?.email || '未登录'}</div>
            {version && <div className="text-xs text-slate-600">v{version}</div>}
          </div>
        </header>
        {/* 内容区 */}
        <main className="flex-1 overflow-auto p-5">{children}</main>
      </div>
      <ReleaseNotice appVersion={version} />
      <RechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />
    </div>
  );
}
