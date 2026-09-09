// 主框架布局 - 左侧导航 + 顶部状态栏 + 内容区
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PenLine, Mic, Smartphone,
  User, Wallet, Menu, X,
  Download, Loader2, CheckCircle2, AlertCircle, BookOpen, Chrome, HelpCircle, Sparkles, AlertTriangle, ArrowRight
} from 'lucide-react';
import { api, useProfile, useUpdateStatus, useMainWindowVisible } from '../lib/ipc';
import { isMacPlatform } from '../../shared/shortcuts';
import RechargeModal from './RechargeModal';
import ReleaseNotice from './ReleaseNotice';
import FeedbackButton from './FeedbackButton';

interface NavItem { to: string; label: string; icon: ReactNode; badge?: string; }

const NAV: NavItem[] = [
  { to: '/', label: '工作台', icon: <LayoutDashboard size={18} /> },
  { to: '/exam', label: isMacPlatform() ? '笔试助手' : 'PC笔试助手', icon: <PenLine size={18} /> },
  { to: '/interview', label: isMacPlatform() ? '面试助手' : 'PC面试助手', icon: <Mic size={18} /> },
  ...(!isMacPlatform() ? [{ to: '/companion', label: '双机协作笔面试', icon: <Smartphone size={18} /> }] : []),
  { to: '/extension', label: '网申插件', icon: <Chrome size={18} /> },
];

export default function MainLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [approvedPath, setApprovedPath] = useState('');
  useEffect(() => {
    let alive = true;
    const path = location.pathname;
    if (isMacPlatform() || !['/exam', '/interview', '/companion'].includes(path)) { setApprovedPath(path); return; }
    const target = path === '/companion' ? 'mobile' : 'pc';
    // Route changes own workspace lifecycle. Entering the companion page
    // enables it immediately (pairing can happen afterwards); entering either
    // PC page exits companion and restores the original PC helpers.
    api.companion.workspace(target).then(() => {
      if (!alive) return;
      setApprovedPath(path);
    }).catch((error: unknown) => { if (alive) setEntryError(error instanceof Error ? error.message : '无法切换助手工作区'); });
    return () => { alive = false; };
  }, [location.pathname, navigate]);
  const [version, setVersion] = useState('');
  const updateStatus = useUpdateStatus();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  // 积分不足蒙版（仅当主窗口对用户可见时显示；最小化/隐藏时不打扰悬浮框用户）
  const mainVisible = useMainWindowVisible();
  const [outOfCredits, setOutOfCredits] = useState<{ reason?: string; balance?: number; cost?: number } | null>(null);

  useEffect(() => { api.system.getAppVersion().then(setVersion).catch(() => {}); }, []);
  // 监听托盘菜单触发的充值入口
  useEffect(() => {
    const off = api.system.onShowRechargeModal(() => setRechargeOpen(true));
    return () => { off?.(); };
  }, []);
  // 监听主进程派发的「积分不足」事件 -> 触发主窗口蒙版 + 充值弹框
  useEffect(() => {
    const off = api.system.onOutOfCredits((payload: { reason?: string; balance?: number; cost?: number }) =>
      setOutOfCredits(payload || { reason: 'credits' })
    );
    return () => { off?.(); };
  }, []);
  // InviteAgent 等组件在未充值时 dispatch 自定义事件，要求直接打开充值弹框
  useEffect(() => {
    const handler = () => setRechargeOpen(true);
    window.addEventListener('quizmate:open-recharge', handler as EventListener);
    return () => window.removeEventListener('quizmate:open-recharge', handler as EventListener);
  }, []);

  // 主窗口从不可见变为可见时若仍有未处理的积分不足事件，立刻弹框 + 蒙版
  useEffect(() => {
    if (mainVisible && outOfCredits) {
      setRechargeOpen(true);
    }
  }, [mainVisible, outOfCredits]);

  const closeOutOfCredits = () => setOutOfCredits(null);

  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;
  // ===== 版本更新提示 =====
  const updateKey = updateStatus ? `${updateStatus.status}:${updateStatus.version ?? updateStatus.message ?? ''}` : null;
  const canDismissUpdate = updateStatus?.status === 'available' || updateStatus?.status === 'error';
  const updateDismissed = canDismissUpdate && updateKey === dismissedKey;
  const showUpdateBanner = !!updateStatus && !updateDismissed &&
    ['available', 'downloading', 'downloaded', 'error'].includes(updateStatus.status);
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
    <div className="flex h-screen bg-slate-950 text-slate-100" onClickCapture={event => {
      if (isMacPlatform()) return;
      const anchor = (event.target as HTMLElement).closest('a,[data-assistant-route]');
      const path = anchor?.getAttribute('data-assistant-route') || anchor?.getAttribute('href')?.replace(/^#/, '');
      if (!path || !['/exam', '/interview', '/companion'].includes(path)) return;
      event.preventDefault(); event.stopPropagation();
      const target = path === '/companion' ? 'mobile' : 'pc';
      api.companion.workspace(target).then(() => { setEntryError(''); navigate(path); })
        .catch((error: unknown) => setEntryError(error instanceof Error ? error.message : '无法切换助手工作区'));
    }}>
      {entryError && <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="entry-error-title"
        aria-describedby="entry-error-message"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === 'Escape') setEntryError(''); }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setEntryError(''); }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm"
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,.55)]">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500" />
          <div className="p-6 sm:p-7">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-300/25">
                <AlertTriangle size={21} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">工作区冲突提示</p>
                <h2 id="entry-error-title" className="mt-1 text-lg font-semibold text-slate-100">暂时无法进入此助手</h2>
              </div>
            </div>
            <p id="entry-error-message" className="rounded-xl border border-slate-700/80 bg-slate-800/50 px-4 py-3 text-sm leading-6 text-slate-200">{entryError}</p>
            <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>请先停止当前运行中的工作区</span>
              <ArrowRight size={14} aria-hidden="true" />
            </div>
            <button autoFocus className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-900/20 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/70" onClick={() => setEntryError('')}>
              知道了
            </button>
          </div>
        </div>
      </div>}
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
                  立即更新
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
                <span>{isMacPlatform() ? '已就绪：macOS 版本需手动覆盖安装，请前往官网下载' : '下载完成，正在关闭客户端并启动安装…'}</span>
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
            <button onClick={openGuide} className="btn-outline text-xs" title="重新打开操作指引">
              <HelpCircle size={14} /> 操作指引
            </button>
            <button onClick={() => setRechargeOpen(true)} className="btn-outline text-xs" title="充值积分">
              <Wallet size={14} /> <span className="text-amber-400 font-semibold">{credits}</span> 积分
            </button>
            <button
              onClick={() => {
                // 无论当前在哪个菜单，点击都先跳转到个人中心（路由 /profile），
                // 再派发全局事件，由 InviteAgent 在个人中心页自动展开邀请代理面板
                if (location.pathname !== '/profile') {
                  navigate('/profile');
                }
                // 跳转是异步的，先派发事件；若 InviteAgent 尚未挂载，监听会在挂载时收到（见 InviteAgent.tsx 内 pendingAutoOpen 处理）
                window.dispatchEvent(new CustomEvent('quizmate:open-invite-panel'));
                sessionStorage.setItem('quizmate:invite-auto-open', '1');
              }}
              className="btn-outline text-xs"
              title="邀请代理 · 双方各得 20 积分"
            >
              <Sparkles size={14} className="text-amber-300" /> 邀请
            </button>
            <div className="text-xs text-slate-500 ml-2">{acct?.email || '未登录'}</div>
            {version && <div className="text-xs text-slate-600">v{version}</div>}
          </div>
        </header>
        {/* 内容区 */}
        <main className="flex-1 overflow-auto p-5">{approvedPath === location.pathname ? children : <p className="text-slate-400">正在确认助手状态…</p>}</main>
      </div>
      <FeedbackButton />
      {/* 充值弹窗 */}
      <RechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />

      {/* 积分不足蒙版：仅在主窗口对用户可见时弹出，最小化/隐藏时不打扰悬浮框用户 */}
      {outOfCredits && mainVisible && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          aria-modal="true"
          role="dialog"
        >
          <div className="max-w-md w-[92%] rounded-2xl border border-amber-500/50 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-7 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={18} className="text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">积分不足</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2 leading-snug">
              请充值后使用，QuizMate 陪伴你成功上岸
            </h3>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">
              当前积分余额 <b className="text-amber-400">{credits}</b>，已无法继续笔试搜题或面试实时辅助。
              {typeof outOfCredits.cost === 'number' && (
                <> 本次需要 <b className="text-slate-200">{outOfCredits.cost}</b> 积分。</>
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => { closeOutOfCredits(); setRechargeOpen(true); }}
                className="btn-primary flex-1"
              >
                <Wallet size={14} /> 立即充值
              </button>
              <button
                onClick={closeOutOfCredits}
                className="btn-outline flex-1"
                title="稍后再说（积分仍为 0，相关功能不可用）"
              >
                稍后再说
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              提示：本次扣减失败、笔试 / 面试被中断时也会触发此提示。客户端最小化时不会弹出，避免打扰使用悬浮框的你。
            </p>
          </div>
        </div>
      )}

      <ReleaseNotice appVersion={version} />
    </div>
  );
}
