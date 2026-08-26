// 邀请代理模块 - 从原考试助手迁移
// 邀请新用户注册双方各得积分，被邀请人充值可获提成 + 阶梯奖励（10 位 → 笔面试上岸包 pro / 20 位 → 无忧包 unlimited）
import { useState, useEffect } from 'react';
import {
  Users, Copy, Check, Image as ImageIcon, Download, Share2,
  Loader2, Gift, Trophy, Sparkles
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../lib/ipc';

interface ReferralOverview {
  inviteCode?: string;
  inviteLink?: string;
  shareText?: string;
  hasRecharged?: boolean;
  stats?: {
    totalInvited: number;
    registered: number;
    activated: number;
    rewarded: number;
    recharged: number;
    deviceBlocked: number;
  };
  tieredBonus?: {
    rechargedCount: number;
    currentTier: { invitedRechargedCount: number; badge: string; description: string; tierPackageId: string | null } | null;
    nextTier: { invitedRechargedCount: number; badge: string; description: string; tierPackageId: string | null } | null;
    tiers: Array<{
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

  // 账户是否已充值：未充值时仅展示「先充值才能使用邀请代理」提示入口，不展开面板
  const [hasRecharged, setHasRecharged] = useState<boolean | null>(null);

  useEffect(() => {
    // 首次挂载时拉一次 profile 用于判断是否已充值（避免在 InviteAgent 组件里直接用 hook 影响 hooks 顺序）
    let cancelled = false;
    api.auth.getProfile()
      .then((p: any) => {
        if (cancelled) return;
        const flag = p?.account?.hasRecharged === true || p?.hasRecharged === true;
        setHasRecharged(flag);
      })
      .catch(() => { if (!cancelled) setHasRecharged(false); });
    return () => { cancelled = true; };
  }, []);

  // 监听全局事件：充值成功后弹窗点击「立即邀请」/ 外部菜单触发时自动展开邀请代理面板
  useEffect(() => {
    const open = () => {
      setPanelOpen(true);
      // 重新拉一次 profile 和 overview（充值后 hasRecharged 已变化）
      api.auth.getProfile()
        .then((p: any) => {
          const flag = p?.account?.hasRecharged === true || p?.hasRecharged === true;
          setHasRecharged(flag);
        })
        .catch(() => {});
      loadOverview();
      // 消费一次性自动展开标记（MainLayout 顶部邀请按钮在跳转前写入）
      sessionStorage.removeItem('quizmate:invite-auto-open');
    };
    window.addEventListener('quizmate:open-invite-panel', open as EventListener);
    return () => window.removeEventListener('quizmate:open-invite-panel', open as EventListener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 兜底：若 MainLayout 跳转 + 派发事件早于 InviteAgent 挂载，监听事件会丢失；
  // 这里在挂载时检查 sessionStorage 中的标记，主动展开一次。
  useEffect(() => {
    const pending = sessionStorage.getItem('quizmate:invite-auto-open');
    if (pending === '1') {
      setPanelOpen(true);
      api.auth.getProfile()
        .then((p: any) => {
          const flag = p?.account?.hasRecharged === true || p?.hasRecharged === true;
          setHasRecharged(flag);
        })
        .catch(() => {});
      loadOverview();
      sessionStorage.removeItem('quizmate:invite-auto-open');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async () => {
    if (!panelOpen) {
      // 未充值用户也可以展开邀请面板，分享文案/海报可生成，只是不能拿到提成和解锁阶梯奖励
      setPanelOpen(true);
      if (!overview) {
        await loadOverview();
      }
    } else {
      setPanelOpen(false);
    }
  };

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
        // 退化为 generateCode（兼容旧后端）
        const fallback = await api.invite.generateCode();
        if (fallback?.success) {
          setOverview({
            inviteCode: fallback.inviteCode,
            inviteLink: fallback.inviteLink,
            shareText: fallback.shareText,
          });
        } else {
          setError(fallback?.error || result?.error || '获取邀请码失败');
        }
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '获取邀请码失败');
    } finally {
      setLoading(false);
    }
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
      canvas.height = 1340;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      const W = 750;
      const H = 1340;

      // 1. 渐变背景
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#1e3a8a');
      gradient.addColorStop(0.5, '#1e40af');
      gradient.addColorStop(1, '#3b82f6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      // 2. 顶部 Logo 圆形
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(375, 130, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', 375, 132);

      // 3. 主标题
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText('QuizMate', 375, 240);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('笔试 / 面试 答题悬浮助手', 375, 280);

      // 4. 卖点
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('注册即送 50 积分 · 填写邀请码再得 20 积分', 375, 340);

      // 5. 阶梯奖励 banner（黄底深字：10 位 → 笔面试上岸包 / 20 位 → 无忧包）
      const bannerY = 380;
      const bannerH = 140;
      ctx.fillStyle = '#facc15';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(60, bannerY, W - 120, bannerH, 18);
        ctx.fill();
      } else {
        ctx.fillRect(60, bannerY, W - 120, bannerH);
      }
      ctx.fillStyle = '#7c2d12';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('【重磅更新】阶梯邀请奖励', 375, bannerY + 38);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('邀满 10 位充值好友 赠 笔面试上岸包', 375, bannerY + 78);
      ctx.fillText('邀满 20 位充值好友 再赠 无忧包', 375, bannerY + 116);

      // 6. 功能列表（5 条，覆盖笔试 + 面试 + 防检测）
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('✓ 全场景功能', 90, bannerY + bannerH + 50);

      ctx.fillStyle = '#dbeafe';
      ctx.font = '22px sans-serif';
      const features = [
        '·  笔试 / 面试 全场景，悬浮作答',
        '·  笔试：截图秒出答案，悬浮窗隐身',
        '·  面试：实时听写 + AI 参考答案',
        '·  直接读取页面 / 摄像头 / 麦克风，智能作答',
        '·  不切屏 · 不截屏 · 后台无法捕获',
      ];
      features.forEach((text, i) => {
        ctx.fillText(text, 90, bannerY + bannerH + 90 + i * 38);
      });

      // 7. 邀请码卡片（CHG-20260822-07：缩小邀请码字号 + 卡片高度，避免遮挡上方「全场景功能」标题）
      const cardY = 700;
      const cardH = 110;
      ctx.fillStyle = '#ffffff';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(80, cardY, W - 160, cardH, 16);
        ctx.fill();
      } else {
        ctx.fillRect(80, cardY, W - 160, cardH);
      }
      ctx.fillStyle = '#6b7280';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('我的邀请码', 375, cardY + 32);
      ctx.fillStyle = '#1e40af';
      // 邀请码字号从 56px 缩到 36px，加 letterSpacing 提升辨识度，整体宽度下降约 35%
      ctx.font = 'bold 36px monospace';
      ctx.fillText(overview.inviteCode || '', 375, cardY + 82);

      // 8. 二维码（CHG-20260822-07：向下平移 20px + 缩小到 220x220，避免与上方卡片粘连）
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, overview.inviteLink || '', {
        width: 220,
        margin: 1,
        color: { dark: '#1e40af', light: '#ffffff' },
      });
      const qrSize = 220;
      const qrX = (W - qrSize) / 2;
      const qrY = 880;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // 9. 底部说明
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('扫码注册，填写邀请码即得积分', 375, 1150);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('邀满 10 位充值好友 赠 笔面试上岸包', 375, 1195);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('邀满 20 位充值好友 再赠 无忧包', 375, 1225);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = '18px sans-serif';
      ctx.fillText('quizmate.cn', 375, 1260);

      const dataUrl = canvas.toDataURL('image/png');
      setPosterUrl(dataUrl);
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

  // ===== 阶梯奖励进度条 =====
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
            邀请新用户注册双方各得 20 积分，被邀请人充值可获 5% 提成
          </p>
        </div>
        <button onClick={handleInvite} className="btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
          {panelOpen ? '收起' : hasRecharged === false ? '充值后邀请' : '邀请好友'}
        </button>
      </div>

      {/* 重磅更新 banner */}
      <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2.5 text-xs text-amber-300 leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold">
          <Sparkles size={14} /> 重磅更新
        </div>
        <p className="mt-1 text-amber-200/90">
          邀满 <b className="text-amber-300">10 位已充值好友</b>，赠 <b className="text-amber-300">笔面试上岸包</b>；
          邀满 <b className="text-amber-300">20 位</b> 再赠 <b className="text-amber-300">无忧包</b>，陪伴你成功上岸。
        </p>
      </div>

      {panelOpen && (
        <div className="space-y-3 mt-4">
          {/* 未充值用户：在面板顶部显示提示卡，含「立即邀请」和「立即充值」按钮 */}
          {hasRecharged === false && overview && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-amber-300 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed flex-1">
                  <p className="font-semibold text-amber-300 mb-1">先充值即可解锁邀请奖励</p>
                  <p>
                    邀请代理入口仅对已充值用户开放。完成任意一笔充值后立即解锁：
                  </p>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-amber-100/80">
                    <li>双方各得 20 积分（每邀请一位）</li>
                    <li>被邀请人充值，你拿 5% 提成</li>
                    <li>邀满 10 位已充值好友，赠 笔面试上岸包</li>
                    <li>邀满 20 位已充值好友，再赠 无忧包</li>
                  </ul>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => {
                        const el = document.getElementById('invite-panel-anchor');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                    >
                      <Users size={12} /> 立即邀请
                    </button>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quizmate:open-recharge'))}
                      className="btn bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs"
                    >
                      立即充值
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="p-3 rounded-lg text-sm text-slate-400 bg-slate-900/50 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 正在获取邀请码...
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30">{error}</div>
          )}

          {/* 阶梯奖励进度 */}
          {overview && tiers.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Trophy size={14} /> 邀请阶梯奖励
                </div>
                <div className="text-xs text-slate-300">
                  已充值好友：<b className="text-amber-300">{rechargedCount}</b>
                </div>
              </div>
              {/* 进度条 */}
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {currentTier && (
                <div className="text-xs text-emerald-300 mb-1.5">
                  ✓ 已达成：{currentTier.badge}（{currentTier.invitedRechargedCount} 位）
                </div>
              )}
              {nextTier && (
                <div className="text-xs text-slate-300 mb-2">
                  还差 <b className="text-amber-300">{Math.max(0, nextTier.invitedRechargedCount - rechargedCount)}</b> 位 → 解锁
                  <b className="text-amber-300 ml-1">{nextTier.badge}</b>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {tiers.map((t) => {
                  const pkgLabel = t.tierPackageId ? (TIER_PACKAGE_LABEL[t.tierPackageId] || t.tierPackageId) : null;
                  return (
                    <div
                      key={t.invitedRechargedCount}
                      className={`rounded-md p-2 text-xs border ${t.unlocked
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-slate-900/50 border-slate-700'}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-semibold ${t.unlocked ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {t.invitedRechargedCount} 位 · {t.badge}
                        </span>
                        {t.unlocked && <Check size={12} className="text-emerald-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-snug">
                        {pkgLabel ? (
                          <>赠 <b className="text-amber-300">{pkgLabel}</b></>
                        ) : (
                          <>{t.description}</>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {overview && (
            <>
              {/* 邀请码 */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请码</div>
                  <div className="text-sm font-mono font-medium truncate">{overview.inviteCode}</div>
                </div>
                <button onClick={() => handleCopy(overview.inviteCode || '', '邀请码')} className="btn-outline text-xs shrink-0">
                  {copied === '邀请码' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 邀请链接 */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请链接</div>
                  <div className="text-sm truncate">{overview.inviteLink}</div>
                </div>
                <button onClick={() => handleCopy(overview.inviteLink || '', '链接')} className="btn-outline text-xs shrink-0">
                  {copied === '链接' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 分享文案 */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">分享文案</div>
                  <div className="text-sm whitespace-pre-wrap break-all">{overview.shareText}</div>
                </div>
                <button onClick={() => handleCopy(overview.shareText || '', '文案')} className="btn-outline text-xs shrink-0">
                  {copied === '文案' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 邀请海报 */}
              <div className="p-3 rounded-lg bg-slate-900/50">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs text-slate-500">邀请海报</div>
                    <div className="text-xs text-slate-400 mt-0.5">覆盖笔试 / 面试全场景 · 10 位赠笔面试上岸包 / 20 位再赠无忧包</div>
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
              <Gift size={14} /> 点击「邀请好友」获取你的专属邀请码
            </div>
          )}
        </div>
      )}
    </div>
  );
}
