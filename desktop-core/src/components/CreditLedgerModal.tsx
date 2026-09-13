import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, History, Loader2, X } from 'lucide-react';
import { api } from '../lib/ipc';

type LedgerRecord = {
  id: string;
  operationType: string;
  credits: number;
  balanceAfter: number;
  source: string;
  reason: string;
  createdAt: string;
};

const operationNames: Record<string, string> = {
  consume: '使用扣减',
  register_bonus: '注册赠送',
  referral_bonus: '邀请奖励',
  recharge: '充值到账',
  activity_bonus: '活动奖励',
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export default function CreditLedgerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [records, setRecords] = useState<LedgerRecord[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError('');
    api.auth.getCreditLedger(1, 50).then((result: any) => {
      if (!alive) return;
      if (!result?.success) throw new Error(result?.error || '积分明细读取失败');
      setBalance(Number(result.creditBalance ?? 0));
      setTotal(Number(result.total ?? 0));
      setRecords(Array.isArray(result.records) ? result.records : []);
    }).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : '积分明细读取失败');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="credit-ledger-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2"><History size={18} className="text-amber-400" /><h2 id="credit-ledger-title" className="font-semibold">积分明细记录</h2></div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
          当前余额 <strong className="text-amber-400">{balance ?? '—'}</strong> 积分 · 共 {total} 条记录
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {loading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />正在读取该账号的积分明细…</div>}
          {!loading && error && <p className="py-10 text-center text-sm text-rose-400">{error}</p>}
          {!loading && !error && records.length === 0 && <p className="py-10 text-center text-sm text-slate-500">暂无积分明细记录</p>}
          {!loading && !error && records.length > 0 && <div className="space-y-2">
            {records.map((record) => {
              const positive = record.credits > 0;
              return <div key={record.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3">
                {positive ? <ArrowUpCircle size={18} className="shrink-0 text-emerald-400" /> : <ArrowDownCircle size={18} className="shrink-0 text-rose-400" />}
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm"><span>{operationNames[record.operationType] || record.operationType}</span>{record.reason && <span className="truncate text-xs text-slate-500">{record.reason}</span>}</div><div className="mt-1 text-xs text-slate-500">{formatTime(record.createdAt)} · 余额 {record.balanceAfter}</div></div>
                <strong className={positive ? 'text-emerald-400' : 'text-rose-400'}>{positive ? '+' : ''}{record.credits}</strong>
              </div>;
            })}
          </div>}
        </div>
      </div>
    </div>
  );
}
