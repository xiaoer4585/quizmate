// 登录/注册页 - 客户端内完成，不跳转官网
import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Loader2, Sparkles, Gift } from 'lucide-react';
import { api, useConfig } from '../lib/ipc';

export default function Login({ onLogged }: { onLogged: () => void }) {
  const { data: config } = useConfig();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('请输入邮箱和密码'); return; }
    if (mode === 'register' && password !== confirmPwd) { setError('两次输入的密码不一致'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      if (mode === 'login') {
        const res = await api.auth.login(email.trim(), password);
        if (res?.success) onLogged();
        else setError(res?.error || '登录失败，请检查账号密码');
      } else {
        const res = await api.auth.register(email.trim(), password, inviteCode.trim() || undefined);
        if (res?.success) {
          setInfo('注册成功！正在自动登录…');
          // 注册成功后尝试自动登录
          const loginRes = await api.auth.login(email.trim(), password);
          if (loginRes?.success) onLogged();
          else {
            setMode('login');
            setInfo('注册成功，请登录');
          }
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
            <div>
              <label className="label">密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'} required
                  className="input pl-9 pr-9"
                  placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
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
                <div>
                  <label className="label">邀请码（选填）</label>
                  <input
                    className="input"
                    placeholder="填写邀请码可获额外积分"
                    value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                    disabled={loading}
                  />
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
              {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="flex items-center justify-between text-xs text-slate-400 mt-4">
              <button className="hover:text-brand" onClick={() => setMode('register')}>
                没有账号？立即注册
              </button>
              <button className="hover:text-brand" onClick={() => api.system.openExternal(config?.resetPasswordUrl || 'https://www.quizmate.vip/#credits')}>
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
