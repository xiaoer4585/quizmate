// 邀请代理模块 - 客户端内展示邀请文案、链接、海报和后台统一统计
import { useEffect, useState } from 'react';
import { Users, Copy, Check, Image as ImageIcon, Download, Share2, Loader2, Gift, Trophy, Sparkles } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../lib/ipc';

interface ReferralOverview {
  inviteCode?: string;
  inviteLink?: string;
  shareText?: string;
  hasRecharged?: boolean;
  stats?: {
    totalInvited?: number;
    registered?: number;
    activated?: number;
    rewarded?: number;
    recharged?: number;
    deviceBlocked?: number;
  };
  tieredBonus?: {
    rechargedCount?: number;
    currentTier?: { invitedRechargedCount: number; badge: string; description: string; tierPackageId: string | null } | null;
    nextTier?: { invitedRechargedCount: number; badge: string; description: string; tierPackageId: string | null } | null;
    tiers?: Array<{
      invitedRechargedCount: number;
      badge: string;
      description: string;
      tierPackageId: string | null;
      unlocked: boolean;
    }>;
  };
}

const TIER_PACKAGE_LABEL: Record<string, string> = {
  pro: '笔面试上岸包',
  unlimited: '无忧包',
};

export default function InviteAgent() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterStatus, setPosterStatus] = useState('');
  const [hasRecharged, setHasRecharged] = useState<boolean | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.invite.getOverview();
      if (result?.success && result.overview) {
        const ov = result.overview as ReferralOverview;
        setOverview(ov);
        if (typeof ov.hasRecharged === 'boolean') setHasRecharged(ov.hasRecharged);
      } else {
        const fallback = await api.invite.generateCode();
        if (fallback?.success) {
          setOverview({
            inviteCode: fallback.inviteCode,
            inviteLink: fallback.inviteLink,
            shareText: fallback.shareText,
          });
        } else {
          setError(fallback?.error || result?.error || '获取邀请信息失败');
        }
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '获取邀请信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api.auth.getProfile()
      .then((p: any) => {
        if (!cancelled) setHasRecharged(p?.account?.hasRecharged === true || p?.hasRecharged === true);
      })
      .catch(() => { if (!cancelled) setHasRecharged(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const openInvitePanel = () => {
      setPanelOpen(true);
      void loadOverview();
      sessionStorage.removeItem('quizmate:invite-auto-open');
    };
    window.addEventListener('quizmate:open-invite-panel', openInvitePanel);
    return () => window.removeEventListener('quizmate:open-invite-panel', openInvitePanel);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('quizmate:invite-auto-open') === '1') {
      setPanelOpen(true);
      void loadOverview();
      sessionStorage.removeItem('quizmate:invite-auto-open');
    }
  }, []);

  const handleInvite = async () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    if (!overview) await loadOverview();
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('复制失败');
      setTimeout(() => setCopied(''), 2000);
    }
  };

  const generatePoster = async () => {
    if (!overview?.inviteCode || !overview?.inviteLink) {
      setPosterStatus('缺少邀请码或邀请链接');
      return;
    }
    setPosterGenerating(true);
    setPosterStatus('正在生成海报...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 750;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      const gradient = ctx.createLinearGradient(0, 0, 0, 1280);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(0.55, '#1d4ed8');
      gradient.addColorStop(1, '#0891b2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 750, 1280);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(375, 120, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d4ed8';
      ctx.font = 'bold 62px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', 375, 122);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText('QuizMate', 375, 230);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('笔试 / 面试 实时辅助工具', 375, 272);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('注册即送积分 · 填写邀请码再得 20 积分', 375, 335);

      ctx.fillStyle = '#facc15';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(60, 380, 630, 132, 18);
        ctx.fill();
      } else {
        ctx.fillRect(60, 380, 630, 132);
      }
      ctx.fillStyle = '#713f12';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('邀请好友一起上岸', 375, 420);
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('每邀请 1 位，双方各得 20 积分', 375, 460);
      ctx.fillText('好友充值，你拿 20% 提成', 375, 494);

      ctx.fillStyle = '#dbeafe';
      ctx.font = '23px sans-serif';
      ctx.textAlign = 'left';
      [
        '· 笔试截图分析，快速整理答案思路',
        '· 面试实时听写，AI 生成参考回答',
        '· 邀满 10 位已充值好友，赠 笔面试上岸包',
        '· 邀满 20 位已充值好友，再赠 无忧包',
      ].forEach((text, i) => ctx.fillText(text, 100, 585 + i * 42));

      ctx.fillStyle = '#ffffff';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(80, 780, 590, 132, 16);
        ctx.fill();
      } else {
        ctx.fillRect(80, 780, 590, 132);
      }
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('我的邀请码', 375, 822);
      ctx.fillStyle = '#1d4ed8';
      ctx.font = 'bold 56px monospace';
      ctx.fillText(overview.inviteCode || '', 375, 878);

      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, overview.inviteLink || '', {
        width: 240,
        margin: 1,
        color: { dark: '#1d4ed8', light: '#ffffff' },
      });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(255, 960, 240, 240);
      ctx.drawImage(qrCanvas, 255, 960, 240, 240);

      ctx.fillStyle = '#ffffff';
      ctx.font = '20px sans-serif';
      ctx.fillText('扫码注册，填写邀请码即可领取奖励', 375, 1238);

      setPosterUrl(canvas.toDataURL('image/png'));
      setPosterStatus('海报已生成');
    } catch (e: any) {
      setPosterStatus(e instanceof Error ? e.message : '生成海报失败');
    } finally {
      setPosterGenerating(false);
    }
  };

  const savePoster = async () => {
    if (!posterUrl) return;
    setPosterStatus('正在保存...');
    try {
      const result = await api.invite.savePoster(posterUrl);
      if (result.success) setPosterStatus('海报已保存到：' + result.path);
      else if (result.canceled) setPosterStatus('已取消保存');
      else setPosterStatus(result.error || '保存失败');
    } catch (e: any) {
      setPosterStatus(e instanceof Error ? e.message : '保存失败');
    }
  };

  const sharePoster = async () => {
    if (!posterUrl) return;
    setPosterStatus('正在打开...');
    try {
      const result = await api.invite.sharePoster(posterUrl);
      if (result.success) setPosterStatus('海报已打开，请通过微信/QQ发送图片给好友');
      else setPosterStatus(result.error || '分享失败');
    } catch (e: any) {
      setPosterStatus(e instanceof Error ? e.message : '分享失败');
    }
  };

  const tiers = overview?.tieredBonus?.tiers || [];
  const rechargedCount = overview?.tieredBonus?.rechargedCount ?? overview?.stats?.recharged ?? 0;
  const nextTier = overview?.tieredBonus?.nextTier;
  const currentTier = overview?.tieredBonus?.currentTier;
  const progressTarget = nextTier?.invitedRechargedCount ?? tiers[tiers.length - 1]?.invitedRechargedCount ?? 10;
  const progressMax = Math.max(progressTarget, rechargedCount, 1);
  const progressPercent = Math.min(100, Math.round((rechargedCount / progressMax) * 100));

  return (
    <div id="invite-panel-anchor" className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users size={16} className="text-brand" /> 邀请代理
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            邀请新用户注册双方各得 20 积分，被邀请人充值可获 20% 提成
          </p>
        </div>
        <button onClick={handleInvite} className="btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
          {panelOpen ? '收起' : '立即邀请'}
        </button>
      </div>

      <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2.5 text-xs text-amber-300 leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold">
          <Sparkles size={14} /> 先充值即可解锁邀请奖励
        </div>
        <p className="mt-1 text-amber-200/90">
          完成任意一笔充值后立即解锁：双方各得 20 积分（每邀请一位）；被邀请人充值，你拿 20% 提成；邀满 10 位已充值好友赠 笔面试上岸包，邀满 20 位再赠 无忧包。
        </p>
        <div className="mt-2 flex gap-2 flex-wrap">
          <button onClick={async () => { setPanelOpen(true); await loadOverview(); }} disabled={loading} className="btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
            <Users size={12} /> 立即邀请
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('quizmate:open-recharge'))} className="btn bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs">
            立即充值
          </button>
        </div>
      </div>

      {panelOpen && (
        <div className="space-y-3 mt-4">
          {loading && (
            <div className="p-3 rounded-lg text-sm text-slate-400 bg-slate-900/50 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 正在获取邀请信息...
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30">{error}</div>
          )}

          {hasRecharged === false && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              当前账号尚未充值，邀请链接可先分享；提成和阶梯礼包将在完成任意充值后解锁。
            </div>
          )}

          {overview?.stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500">累计邀请</div>
                <div className="text-lg font-semibold text-slate-100">{overview.stats.totalInvited ?? overview.stats.registered ?? 0}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500">已注册</div>
                <div className="text-lg font-semibold text-slate-100">{overview.stats.registered ?? 0}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500">已充值好友</div>
                <div className="text-lg font-semibold text-amber-300">{overview.stats.recharged ?? rechargedCount}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500">已发奖励</div>
                <div className="text-lg font-semibold text-emerald-300">{overview.stats.rewarded ?? 0}</div>
              </div>
            </div>
          )}

          {tiers.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Trophy size={14} /> 邀请阶梯奖励
                </div>
                <div className="text-xs text-slate-300">已充值好友：<b className="text-amber-300">{rechargedCount}</b></div>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
              {currentTier && <div className="text-xs text-emerald-300 mb-1.5">已达成：{currentTier.badge}（{currentTier.invitedRechargedCount} 位）</div>}
              {nextTier && <div className="text-xs text-slate-300 mb-2">还差 <b className="text-amber-300">{Math.max(0, nextTier.invitedRechargedCount - rechargedCount)}</b> 位解锁 <b className="text-amber-300">{nextTier.badge}</b></div>}
              <div className="grid grid-cols-2 gap-2">
                {tiers.map((t) => {
                  const pkgLabel = t.tierPackageId ? (TIER_PACKAGE_LABEL[t.tierPackageId] || t.tierPackageId) : null;
                  return (
                    <div key={t.invitedRechargedCount} className={`rounded-md p-2 text-xs border ${t.unlocked ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-900/50 border-slate-700'}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-semibold ${t.unlocked ? 'text-emerald-300' : 'text-amber-300'}`}>{t.invitedRechargedCount} 位 · {t.badge}</span>
                        {t.unlocked && <Check size={12} className="text-emerald-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-snug">{pkgLabel ? <>赠 <b className="text-amber-300">{pkgLabel}</b></> : t.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {overview && (
            <>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请码</div>
                  <div className="text-sm font-mono font-medium truncate">{overview.inviteCode}</div>
                </div>
                <button onClick={() => handleCopy(overview.inviteCode || '', '邀请码')} className="btn-outline text-xs shrink-0">
                  {copied === '邀请码' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请链接</div>
                  <div className="text-sm truncate">{overview.inviteLink}</div>
                </div>
                <button onClick={() => handleCopy(overview.inviteLink || '', '链接')} className="btn-outline text-xs shrink-0">
                  {copied === '链接' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请文案</div>
                  <div className="text-sm whitespace-pre-wrap break-all">{overview.shareText}</div>
                </div>
                <button onClick={() => handleCopy(overview.shareText || '', '文案')} className="btn-outline text-xs shrink-0">
                  {copied === '文案' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs text-slate-500">邀请海报</div>
                    <div className="text-xs text-slate-400 mt-0.5">一键生成海报，扫码即可注册</div>
                  </div>
                  <button onClick={generatePoster} disabled={posterGenerating} className="btn bg-purple-600 hover:bg-purple-700 text-white text-xs shrink-0">
                    {posterGenerating ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    {posterGenerating ? '生成中...' : posterUrl ? '重新生成' : '生成海报'}
                  </button>
                </div>
                {posterUrl && (
                  <>
                    <div className="mt-2 flex justify-center">
                      <img src={posterUrl} alt="邀请海报" className="max-w-full max-h-[460px] rounded-lg" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={savePoster} className="btn-outline flex-1 text-xs">
                        <Download size={12} /> 保存海报
                      </button>
                      <button onClick={sharePoster} className="btn bg-emerald-500 hover:bg-emerald-600 text-white flex-1 text-xs">
                        <Share2 size={12} /> 分享到微信
                      </button>
                    </div>
                  </>
                )}
                {posterStatus && (
                  <p className={`text-xs mt-2 ${posterStatus.includes('失败') || posterStatus.includes('错误') ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {posterStatus}
                  </p>
                )}
              </div>
            </>
          )}
          {!loading && !error && !overview && (
            <div className="p-3 rounded-lg text-sm text-slate-400 bg-slate-900/50 flex items-center gap-2">
              <Gift size={14} /> 点击「立即邀请」获取你的专属邀请信息
            </div>
          )}
        </div>
      )}
    </div>
  );
}
