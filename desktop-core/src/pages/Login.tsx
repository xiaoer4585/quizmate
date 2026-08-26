// 登录/注册页 - 客户端内完成，不跳转官网
import { useEffect, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Loader2, Sparkles, Gift, KeyRound } from 'lucide-react';
import { api, useConfig } from '../lib/ipc';

export default function Login({ onLogged }: { onLogged: () => void }) {
  const { data: config } = useConfig();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  const sendRegisterCode = async () => {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效邮箱');
      return;
    }
    setCodeLoading(true); setError(''); setInfo('');
    try {
      const res = await api.auth.sendRegisterCode(normalizedEmail);
      if (!res?.success) {
        setError(res?.error || '验证码发送失败');
        return;
      }
      setCodeCooldown(Number(res.cooldown || 60));
      setInfo(res?.reused ? '验证码已发送，请勿重复点击' : '验证码已发送，请查收邮箱');
    } catch (e: any) {
      setError(e?.message || '验证码发送失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('请输入邮箱和密码'); return; }
    if (mode === 'register' && !/^\d{6}$/.test(verificationCode.trim())) { setError('请输入邮箱收到的 6 位数字验证码'); return; }
    if (mode === 'register' && password.length < 8) { setError('密码至少需要 8 位'); return; }
    if (mode === 'register' && password !== confirmPwd) { setError('两次输入的密码不一致'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      if (mode === 'login') {
        const res = await api.auth.login(email.trim(), password);
        if (res?.success) onLogged();
        else setError(res?.error || '登录失败，请检查账号密码');
      } else {
        const res = await api.auth.register(email.trim(), verificationCode.trim(), password, inviteCode.trim().toUpperCase() || undefined);
        if (res?.success) {
          setInfo('注册成功，正在进入客户端…');
          onLogged();
        } else {
          setError(res?.error || '注册失败');
        }
      }
    } catch (e: any) {
      setError(e?.message || '网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-brand/10 p-4">
      <div className="w-full max-w-md">
        {/* 品牌区 */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand to-exam flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg shadow-brand/30">
            Q
          </div>
          <h1 className="text-xl font-bold">QuizMate</h1>
          <p className="text-sm text-slate-400 mt-1">笔试截图答题 · 面试实时辅助</p>
        </div>

        {/* 登录/注册卡片 */}
        <div className="card backdrop-blur">
          {/* 模式切换 */}
          <div className="flex gap-1 p-1 bg-slate-900 rounded-lg mb-4">
            <button
              onClick={() => { setMode('login'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'login' ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <LogIn size={14} className="inline mr-1" /> 登录
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'register' ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <UserPlus size={14} className="inline mr-1" /> 注册
            </button>
          </div>

          {mode === 'login' ? (
            <div className="flex items-center gap-2 text-brand mb-4">
              <Sparkles size={16} />
              <span className="text-sm font-medium">统一账号登录（与官网/考试插件通用）</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <Gift size={16} />
              <span className="text-sm font-medium">注册即送积分，填写邀请码再得积分</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">邮箱</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email" autoFocus required
                  className="input pl-9"
                  placeholder="your@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            {mode === 'register' && (
              <>
                <div>
                  <label className="label">邮箱验证码</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        inputMode="numeric" maxLength={6} required
                        className="input pl-9"
                        placeholder="6 位数字验证码"
                        value={verificationCode}
                        onChange={(e) => { setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendRegisterCode}
                      disabled={loading || codeLoading || codeCooldown > 0}
                      className="btn-outline w-28 shrink-0 justify-center"
                    >
                      {codeLoading ? <Loader2 size={14} className="animate-spin" /> : codeCooldown > 0 ? `${codeCooldown}s` : '获取验证码'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">邀请码（选填）</label>
                  <input
                    className="input uppercase"
                    placeholder="不填则不享受邀请奖励"
                    value={inviteCode}
                    onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setError(''); }}
                    disabled={loading}
                  />
                </div>
              </>
            )}
            <div>
              <label className="label">密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'} required
                  className="input pl-9 pr-9"
                  placeholder={mode === 'register' ? '至少 8 位' : '请输入密码'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="label">确认密码</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPwd ? 'text' : 'password'} required
                      className="input pl-9"
                      placeholder="再次输入密码"
                      value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>
            )}
            {info && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{info}</div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? <Loader2 size={16} className="animate-spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="flex items-center justify-between text-xs text-slate-400 mt-4">
              <button className="hover:text-brand" onClick={() => setMode('register')}>
                没有账号？立即注册
              </button>
              <button className="hover:text-brand" onClick={() => api.system.openExternal(config?.resetPasswordUrl || 'https://quizmate.cn/#credits')}>
                忘记密码
              </button>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-slate-500 mt-6 space-y-1">
          <div>登录即可使用全部功能，积分与官网/插件通用</div>
          <div>笔试与面试功能按积分消耗，求职浏览器插件永久免费</div>
        </div>
      </div>
    </div>
  );
}
