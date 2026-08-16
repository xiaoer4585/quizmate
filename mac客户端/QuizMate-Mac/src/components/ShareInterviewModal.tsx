// 面经分享弹窗 - 面试结束后补充公司/岗位信息，生成面经图片含下载二维码
import { useState, useRef, useEffect } from 'react';
import { X, Download, Share2, Loader2, Image as ImageIcon, Building2, Briefcase } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../lib/ipc';

interface QAItem {
  id: number;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  pending: boolean;
  ts: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  qaList: QAItem[];
  defaultCompany?: string;
  defaultPosition?: string;
}

export default function ShareInterviewModal({ open, onClose, qaList, defaultCompany = '', defaultPosition = '' }: Props) {
  const [company, setCompany] = useState(defaultCompany);
  const [position, setPosition] = useState(defaultPosition);
  const [posterUrl, setPosterUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) {
      setCompany(defaultCompany);
      setPosition(defaultPosition);
      setPosterUrl('');
      setStatus('');
    }
  }, [open, defaultCompany, defaultPosition]);

  const validQaList = qaList.filter((q) => !q.pending && !q.error && q.answer);

  const generatePoster = async () => {
    if (validQaList.length === 0) {
      setStatus('暂无可分享的面经内容');
      return;
    }
    setGenerating(true);
    setStatus('正在生成面经图片…');
    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      // 根据内容计算高度
      const padding = 40;
      const width = 750;
      const headerHeight = 280;
      const qaHeight = validQaList.slice(0, 10).reduce((sum, qa) => {
        const qLines = Math.ceil(qa.question.length / 24) || 1;
        const aLines = qa.answer ? Math.ceil(qa.answer.length / 30) * 1.5 : 0;
        return sum + 60 + qLines * 28 + aLines * 22;
      }, 0);
      const footerHeight = 200;
      const totalHeight = headerHeight + qaHeight + footerHeight;

      canvas.width = width;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      // 1. 渐变背景
      const gradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(0.5, '#1e293b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, totalHeight);

      // 2. 顶部 Logo
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(width / 2, 80, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', width / 2, 82);

      // 3. 标题
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('QuizMate · 面经分享', width / 2, 160);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      const companyText = company ? `${company} · ${position || '面试'}` : position || '面试经验';
      ctx.fillText(companyText, width / 2, 200);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText(`${new Date().toLocaleDateString('zh-CN')} · 共 ${validQaList.length} 道题`, width / 2, 230);

      // 4. 问答内容
      let y = headerHeight + 20;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const maxQa = Math.min(validQaList.length, 10);
      for (let i = 0; i < maxQa; i++) {
        const qa = validQaList[i];
        // 问题
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 20px sans-serif';
        const qLabel = `Q${i + 1}: `;
        ctx.fillText(qLabel, padding, y);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '20px sans-serif';
        const qText = qa.question.length > 80 ? qa.question.substring(0, 80) + '…' : qa.question;
        wrapText(ctx, qText, padding + 50, y, width - padding * 2 - 50, 28);
        y += 28 * Math.ceil(qText.length / 24) + 20;

        // 答案
        if (qa.answer) {
          ctx.fillStyle = '#60a5fa';
          ctx.font = '16px sans-serif';
          ctx.fillText('A:', padding, y);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '16px sans-serif';
          const aText = qa.answer.length > 200 ? qa.answer.substring(0, 200) + '…' : qa.answer;
          wrapText(ctx, aText, padding + 30, y, width - padding * 2 - 30, 22);
          y += 22 * Math.ceil(aText.length / 30) * 1.5 + 30;
        }
        // 分隔线
        if (i < maxQa - 1) {
          ctx.strokeStyle = '#334155';
          ctx.beginPath();
          ctx.moveTo(padding, y);
          ctx.lineTo(width - padding, y);
          ctx.stroke();
          y += 20;
        }
      }

      // 5. 底部二维码区域
      y = totalHeight - footerHeight + 20;
      ctx.fillStyle = '#1e293b';
      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(padding, y, width - padding * 2, footerHeight - 40, 12);
        ctx.fill();
      } else {
        ctx.fillRect(padding, y, width - padding * 2, footerHeight - 40);
      }

      // 下载二维码
      const downloadUrl = 'https://www.quizmate.vip';
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, downloadUrl, {
        width: 120,
        margin: 1,
        color: { dark: '#3b82f6', light: '#ffffff' },
      });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(padding + 30, y + 20, 120, 120);
      ctx.drawImage(qrCanvas, padding + 30, y + 20, 120, 120);

      // 二维码旁文案
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('扫码下载QuizMate客户端', padding + 180, y + 40);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText('笔试截图答题 · 面试实时辅助', padding + 180, y + 75);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('注册即送积分，填写邀请码再得积分', padding + 180, y + 110);

      const dataUrl = canvas.toDataURL('image/png');
      setPosterUrl(dataUrl);
      setStatus('面经图片已生成');
    } catch (e: any) {
      setStatus(e instanceof Error ? e.message : '生成面经图片失败');
    } finally {
      setGenerating(false);
    }
  };

  const savePoster = async () => {
    if (!posterUrl) return;
    setStatus('正在保存…');
    try {
      const result = await api.interview.savePoster?.(posterUrl);
      if (result?.success) setStatus('已保存到：' + result.path);
      else if (result?.canceled) setStatus('已取消保存');
      else setStatus(result?.error || '保存失败');
    } catch (e: any) {
      setStatus(e instanceof Error ? e.message : '保存失败');
    }
  };

  const sharePoster = async () => {
    if (!posterUrl) return;
    setStatus('正在打开…');
    try {
      const result = await api.interview.sharePoster?.(posterUrl);
      if (result?.success) setStatus('已打开，请通过微信/QQ发送图片给好友');
      else setStatus(result?.error || '分享失败');
    } catch (e: any) {
      setStatus(e instanceof Error ? e.message : '分享失败');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-slate-900 rounded-2xl border border-slate-700 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ImageIcon size={20} className="text-rose-400" /> 生成面经
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>

        {/* 公司/岗位信息补充 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">面试公司</label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className="input pl-8" placeholder="如：字节跳动" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">面试岗位</label>
            <div className="relative">
              <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className="input pl-8" placeholder="如：Java 后端开发" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 面经统计 */}
        <div className="text-xs text-slate-400 mb-4 bg-slate-800/50 rounded-lg p-3">
          可分享 {validQaList.length} 道面试题及 AI 参考答案（最多展示 10 道）
        </div>

        {/* 生成按钮 */}
        <div className="flex gap-2 mb-4">
          <button onClick={generatePoster} disabled={generating || validQaList.length === 0} className="btn-primary flex-1">
            {generating ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
            {generating ? '生成中…' : '生成面经图片'}
          </button>
        </div>

        {/* 状态提示 */}
        {status && (
          <div className={`text-xs mb-3 px-3 py-2 rounded-lg ${status.includes('失败') || status.includes('暂无') ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {status}
          </div>
        )}

        {/* 预览图 */}
        {posterUrl && (
          <div className="space-y-3">
            <div className="flex justify-center bg-slate-800/30 rounded-lg p-2">
              <img src={posterUrl} alt="面经图片" className="max-w-full max-h-[400px] rounded-lg" />
            </div>
            <div className="flex gap-2">
              <button onClick={savePoster} className="btn-outline flex-1">
                <Download size={16} /> 保存图片
              </button>
              <button onClick={sharePoster} className="btn bg-emerald-500 hover:bg-emerald-600 text-white flex-1">
                <Share2 size={16} /> 分享到微信/QQ
              </button>
            </div>
          </div>
        )}

        {/* 隐藏的 canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

// Canvas 文字换行
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const chars = text.split('');
  let line = '';
  let currentY = y;
  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}
