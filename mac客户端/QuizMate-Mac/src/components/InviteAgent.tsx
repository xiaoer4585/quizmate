// 邀请代理模块 - 从原考试助手迁移
// 邀请新用户注册双方各得积分，被邀请人充值可获提成
import { useEffect, useState } from 'react';
import { Users, Copy, Check, Image as ImageIcon, Download, Share2, Loader2, Gift, Trophy } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../lib/ipc';

export default function InviteAgent() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [inviteData, setInviteData] = useState<{ inviteCode?: string; inviteLink?: string; shareText?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterStatus, setPosterStatus] = useState('');
  const [hasRecharged, setHasRecharged] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    api.auth.getProfile().then((p: any) => {
      if (!cancelled) setHasRecharged(p?.account?.hasRecharged === true || p?.hasRecharged === true);
    }).catch(() => { if (!cancelled) setHasRecharged(false); });
    return () => { cancelled = true; };
  }, []);

  const handleInvite = async () => {
    if (!panelOpen) {
      if (hasRecharged === false) {
        window.dispatchEvent(new CustomEvent('quizmate:open-recharge'));
        return;
      }
      setPanelOpen(true);
      if (!inviteData) {
        setLoading(true);
        setError('');
        try {
          const result = await api.invite.generateCode();
          if (result.success) {
            setInviteData({ inviteCode: result.inviteCode, inviteLink: result.inviteLink, shareText: result.shareText });
            const current = await api.invite.getOverview().catch(() => null);
            if (current?.success) setOverview(current.overview);
          } else {
            setError(result.error || '获取邀请码失败');
          }
        } catch (e: any) {
          setError(e instanceof Error ? e.message : '获取邀请码失败');
        } finally {
          setLoading(false);
        }
      }
    } else {
      setPanelOpen(false);
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
    if (!inviteData?.inviteCode || !inviteData?.inviteLink) {
      setPosterStatus('缺少邀请码或邀请链接');
      return;
    }
    setPosterGenerating(true);
    setPosterStatus('正在生成海报...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 750;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      // 1. 渐变背景
      const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
      gradient.addColorStop(0, '#1e3a8a');
      gradient.addColorStop(0.5, '#1e40af');
      gradient.addColorStop(1, '#3b82f6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 750, 1200);

      // 2. 顶部 Logo
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(375, 130, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', 375, 132);

      // 3. 标题
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText('QuizMate', 375, 245);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = '24px sans-serif';
      ctx.fillText('应届生一站式求职助手', 375, 285);

      // 4. 卖点文案
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('注册即送 50 积分', 375, 380);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('填写邀请码再得 20 积分', 375, 430);

      // 5. 功能列表
      ctx.fillStyle = '#dbeafe';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'left';
      const features = [
        '·  笔试截图秒出答案，悬浮窗隐身',
        '·  面试实时听写，AI 参考答案',
        '·  笔试截图答题、面试实时辅助',
      ];
      features.forEach((text, i) => {
        ctx.fillText(text, 130, 500 + i * 42);
      });

      // 6. 邀请码卡片
      const cardY = 670;
      const cardH = 130;
      ctx.fillStyle = '#ffffff';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(80, cardY, 590, cardH, 16);
        ctx.fill();
      } else {
        ctx.fillRect(80, cardY, 590, cardH);
      }
      ctx.fillStyle = '#6b7280';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('我的邀请码', 375, cardY + 40);
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 56px monospace';
      ctx.fillText(inviteData.inviteCode || '', 375, cardY + 95);

      // 7. 二维码
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, inviteData.inviteLink || '', {
        width: 240,
        margin: 1,
        color: { dark: '#1e40af', light: '#ffffff' },
      });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(255, 850, 240, 240);
      ctx.drawImage(qrCanvas, 255, 850, 240, 240);

      // 8. 底部说明
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('扫码注册，填写邀请码即得积分', 375, 1130);
      ctx.fillStyle = '#bfdbfe';
      ctx.font = '18px sans-serif';
      ctx.fillText('quizmate.cn', 375, 1170);

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

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users size={16} className="text-brand" /> 邀请代理
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            邀请新用户注册双方各得 20 积分，被邀请人充值可获 20% 提成；充值后可解锁阶梯奖励
          </p>
        </div>
        <button onClick={handleInvite} className="btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
          {panelOpen ? '收起' : '邀请好友'}
        </button>
      </div>

      {panelOpen && (
        <div className="space-y-3 mt-4">
          {loading && (
            <div className="p-3 rounded-lg text-sm text-slate-400 bg-slate-900/50 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 正在获取邀请码...
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30">{error}</div>
          )}
          {inviteData && (
            <>
              {overview?.tieredBonus && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-medium"><Trophy size={13} /> 邀请阶梯奖励</div>
                  <div className="mt-1">已充值好友 {overview.tieredBonus.rechargedCount ?? 0} 人</div>
                  <div className="mt-1">10 人：赠送笔面试上岸包；20 人：赠送无忧包。{overview.tieredBonus.nextTier ? ` 下一档：${overview.tieredBonus.nextTier.description}` : ' 已达到当前最高档。'}</div>
                </div>
              )}
              {/* 邀请码 */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请码</div>
                  <div className="text-sm font-mono font-medium truncate">{inviteData.inviteCode}</div>
                </div>
                <button onClick={() => handleCopy(inviteData.inviteCode || '', '邀请码')} className="btn-outline text-xs shrink-0">
                  {copied === '邀请码' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 邀请链接 */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">邀请链接</div>
                  <div className="text-sm truncate">{inviteData.inviteLink}</div>
                </div>
                <button onClick={() => handleCopy(inviteData.inviteLink || '', '链接')} className="btn-outline text-xs shrink-0">
                  {copied === '链接' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 分享文案 */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">分享文案</div>
                  <div className="text-sm whitespace-pre-wrap break-all">{inviteData.shareText}</div>
                </div>
                <button onClick={() => handleCopy(inviteData.shareText || '', '文案')} className="btn-outline text-xs shrink-0">
                  {copied === '文案' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
              </div>
              {/* 邀请海报 */}
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
                      <img src={posterUrl} alt="邀请海报" className="max-w-full max-h-[400px] rounded-lg" />
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
          {!loading && !error && !inviteData && (
            <div className="p-3 rounded-lg text-sm text-slate-400 bg-slate-900/50 flex items-center gap-2">
              <Gift size={14} /> 点击「邀请好友」获取你的专属邀请码
            </div>
          )}
        </div>
      )}
    </div>
  );
}
