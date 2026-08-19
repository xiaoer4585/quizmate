// 充值弹窗 - 通过账户后端创建订单并完成积分结算
import { useEffect, useState } from 'react';
import { X, Wallet, Zap, Check, ArrowLeft, RotateCw, AlertCircle } from 'lucide-react';
import { useProfile } from '../lib/ipc';

const api = (window as any).api;

interface Package {
  id: string;
  name: string;
  credits: number;
  price: number;
  unitPrice: string;
  feature: string;
  recommended: boolean;
}

// 套餐信息与官网 recharge.html 一致
const PACKAGES: Package[] = [
  { id: 'trial', name: '笔面试体验包', credits: 210, price: 19.90, unitPrice: '0.095', feature: '先体验账户、充值和积分扣费流程', recommended: false },
  { id: 'starter', name: '笔面试实战包', credits: 600, price: 49.90, unitPrice: '0.083', feature: '适合日常练习与短期备考', recommended: true },
  { id: 'pro', name: '笔面试上岸包', credits: 2500, price: 149, unitPrice: '0.060', feature: '适合密集练习和长期刷题', recommended: false },
  { id: 'unlimited', name: '无忧包', credits: 8000, price: 399.90, unitPrice: '0.050', feature: '大额储备，单次积分成本更低', recommended: false },
];

type PayMethod = 'alipay' | 'wechat';
type Step = 'select' | 'pay' | 'qrcode' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RechargeModal({ open, onClose }: Props) {
  const { data: profile, refetch } = useProfile();
  const [selected, setSelected] = useState<Package | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [outTradeNo, setOutTradeNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const acct = profile?.account;
  const credits = profile?.creditBalance ?? acct?.credits ?? 0;

  const resetAndClose = () => {
    setSelected(null);
    setPayMethod(null);
    setStep('select');
    setRefreshing(false);
    setQrUrl('');
    setPayUrl('');
    setOutTradeNo('');
    setError('');
    setLoading(false);
    onClose();
  };

  const handleConfirm = () => {
    if (!selected) return;
    setStep('pay');
  };

  const handleSelectMethod = async (method: PayMethod) => {
    if (!selected) return;
    setPayMethod(method);
    setLoading(true);
    setError('');

    try {
      const order = await api.payment.createOrder({ method, packageId: selected.id });
      const info = order.payUrl || order.qrCode;
      if (order.outTradeNo && info) {
        setOutTradeNo(order.outTradeNo);
        setQrUrl(order.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(info)}`);
        setPayUrl(info);
        setStep('qrcode');
      } else {
        setError('支付平台未返回付款二维码，请稍后重试');
        setStep('error');
      }
    } catch (e: any) {
      setError(e?.message || '网络请求失败，请检查网络后重试');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 'qrcode' || !outTradeNo) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await api.payment.queryOrder(outTradeNo);
        if (stopped || result?.order?.status !== 'paid') return;
        window.clearInterval(timer);
        await refetch();
        resetAndClose();
      } catch {
        // 短暂查单失败时保留二维码，下一个周期继续补偿查询。
      }
    }, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [step, outTradeNo, refetch]);

  if (!open) return null;

  const handleBack = () => {
    if (step === 'qrcode' || step === 'error') {
      setStep('pay');
      setPayMethod(null);
      setQrUrl('');
      setPayUrl('');
      setOutTradeNo('');
      setError('');
    } else if (step === 'pay') {
      setStep('select');
    }
  };

  const handlePaid = async () => {
    setRefreshing(true);
    try {
      if (!outTradeNo) return;
      const result = await api.payment.queryOrder(outTradeNo);
      if (result?.order?.status !== 'paid') {
        setError('暂未查询到付款结果，请稍后再试。');
        return;
      }
      await refetch();
      resetAndClose();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={resetAndClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-slate-900 rounded-2xl border border-slate-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {step !== 'select' && (
              <button onClick={handleBack} className="text-slate-400 hover:text-slate-200 mr-1" title="返回">
                <ArrowLeft size={18} />
              </button>
            )}
            <Wallet size={20} className="text-amber-400" /> 充值积分
          </h2>
          <button onClick={resetAndClose} className="text-slate-400 hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* 步骤一：选择套餐 */}
        {step === 'select' && (
          <>
            <p className="text-xs text-slate-400 mb-4">选择适合你的套餐，积分用于笔试搜题和面试实时辅助</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {PACKAGES.map((pkg) => {
                const isSelected = selected?.id === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    onClick={() => setSelected(pkg)}
                    className={`relative text-left rounded-xl p-4 border transition-all ${
                      pkg.recommended
                        ? 'border-brand bg-brand/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    } ${isSelected ? 'ring-2 ring-brand' : ''}`}
                  >
                    {pkg.recommended && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-brand text-white text-xs font-semibold whitespace-nowrap">
                        推荐
                      </span>
                    )}
                    <div className="text-sm font-semibold text-slate-100 mb-1">{pkg.name}</div>
                    <div className="flex items-baseline gap-1 mb-2">
                      <Zap size={14} className="text-amber-400" />
                      <span className="text-xl font-bold text-amber-400">{pkg.credits}</span>
                      <span className="text-xs text-slate-400">积分</span>
                    </div>
                    <div className="flex items-baseline gap-0.5 mb-2">
                      <span className="text-xs text-slate-400">¥</span>
                      <span className="text-2xl font-bold text-slate-100">{pkg.price}</span>
                    </div>
                    <div className="text-xs text-slate-500 mb-2">约¥{pkg.unitPrice}/积分</div>
                    <div className="text-xs text-slate-400 leading-relaxed">{pkg.feature}</div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                <div className="text-sm text-slate-300">
                  已选择 <span className="font-semibold text-slate-100">{selected.name}</span>
                  <span className="text-slate-400"> · {selected.credits} 积分 · </span>
                  <span className="text-amber-400 font-semibold">¥{selected.price}</span>
                </div>
                <button onClick={handleConfirm} className="btn-primary">
                  确认支付
                </button>
              </div>
            )}
          </>
        )}

        {/* 步骤二：选择支付方式 */}
        {step === 'pay' && selected && (
          <div className="py-4">
            <div className="flex items-center justify-between gap-3 mb-5 p-3 rounded-lg bg-slate-800/80 border border-slate-700">
              <div className="text-sm text-slate-300">
                已选择 <span className="font-semibold text-slate-100">{selected.name}</span>
                <span className="text-slate-400"> · {selected.credits} 积分 · </span>
                <span className="text-amber-400 font-semibold">¥{selected.price}</span>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-4 text-center">请选择支付方式</p>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <button
                onClick={() => handleSelectMethod('alipay')}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-xl p-6 border border-slate-700 bg-slate-800/50 hover:border-sky-500 hover:bg-sky-500/10 transition-all disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-400 text-xl font-bold">支</div>
                <span className="text-sm font-medium text-slate-100">支付宝支付</span>
              </button>
              <button
                onClick={() => handleSelectMethod('wechat')}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-xl p-6 border border-slate-700 bg-slate-800/50 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 text-xl font-bold">微</div>
                <span className="text-sm font-medium text-slate-100">微信支付</span>
              </button>
            </div>
            {loading && (
              <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-2">
                <RotateCw size={14} className="animate-spin" /> 正在创建支付订单...
              </p>
            )}
          </div>
        )}

        {/* 步骤三：扫码支付 */}
        {step === 'qrcode' && selected && payMethod && qrUrl && (
          <div className="py-4 flex flex-col items-center">
            <div className="flex items-center justify-between gap-3 mb-5 w-full max-w-sm p-3 rounded-lg bg-slate-800/80 border border-slate-700">
              <div className="text-sm text-slate-300">
                <span className="font-semibold text-slate-100">{selected.name}</span>
                <span className="text-slate-400"> · {selected.credits} 积分</span>
              </div>
              <span className="text-amber-400 font-semibold">¥{selected.price}</span>
            </div>

            {/* 二维码 */}
            <div className="bg-white rounded-xl p-3 mb-4">
              <img src={qrUrl} alt="支付二维码" width={240} height={240} />
            </div>

            <p className="text-sm text-slate-300 mb-1">
              请使用
              <span className={payMethod === 'alipay' ? 'text-sky-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                {payMethod === 'alipay' ? '支付宝' : '微信'}
              </span>
              扫码支付
            </p>
            <p className="text-xs text-slate-500 mb-5">支付完成后，请点击下方按钮刷新积分</p>

            <button onClick={handlePaid} disabled={refreshing} className="btn-primary">
              {refreshing ? <RotateCw size={14} className="animate-spin" /> : <Check size={14} />} 已完成支付
            </button>
          </div>
        )}

        {/* 错误页面 */}
        {step === 'error' && (
          <div className="py-8 flex flex-col items-center">
            <AlertCircle size={48} className="text-red-400 mb-4" />
            <p className="text-sm text-red-400 mb-4 text-center max-w-sm">{error}</p>
            <button onClick={handleBack} className="btn-outline text-sm">
              返回重新选择
            </button>
          </div>
        )}

        {/* 底部积分余额 */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-sm">
            <Wallet size={16} className="text-amber-400" />
            <span className="text-slate-400">当前积分余额：</span>
            <span className="text-amber-400 font-semibold">{credits}</span>
          </div>
          <div className="text-xs text-slate-500">支付完成后积分将自动到账</div>
        </div>
      </div>
    </div>
  );
}
