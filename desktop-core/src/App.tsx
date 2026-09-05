// 根组件 - 路由 + 登录守卫
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './lib/ipc';
import MainLayout from './components/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Exam from './pages/Exam';
import Interview from './pages/Interview';
import Extension from './pages/Extension';
import Profile from './pages/Profile';
import Overlay from './pages/Overlay';
import ExamOverlay from './pages/ExamOverlay';
import PermissionOnboarding from './components/PermissionOnboarding';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [forceLogin, setForceLogin] = useState(false);
  const [permissionOnboardingRequired, setPermissionOnboardingRequired] = useState(false);
  const location = useLocation();

  // 悬浮窗视图：单独渲染，不走登录守卫与主框架
  // 笔试悬浮窗 /overlay-exam（原考试插件 UI） + 面试悬浮窗 /overlay-interview（面试任务卡片）
  const isOverlay = location.pathname === '/overlay-exam' || location.pathname === '/overlay-interview';

  useEffect(() => {
    if (isOverlay) return;
    let mounted = true;
    (async () => {
      try {
        // macOS permissions are an installation prerequisite, not a feature
        // that can be deferred until after login. This makes a new package
        // request TCC access on its first launch like the legacy client did.
        const permissionState = await api.permissions.getState().catch(() => null) as { platform?: string; completed?: boolean } | null;
        if (mounted) setPermissionOnboardingRequired(permissionState?.platform === 'darwin' && permissionState.completed !== true);
        const ok = await api.auth.isAuthenticated();
        if (mounted) {
          setAuthed(!!ok);
          if (ok) {
            await api.auth.getProfile().catch(() => {});
          }
        }
      } catch {
        if (mounted) setAuthed(false);
      }
    })();
    const off = api.auth.onRequireLogin(() => setForceLogin(true));
    return () => {
      mounted = false;
      off?.();
    };
  }, [isOverlay]);

  // 监听主进程触发的 TTS 朗读（笔试/面试答案播报）
  useEffect(() => {
    if (isOverlay) return;
    const offSpeak = api.onListen?.('tts:speak', (data: any) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(data?.text || '');
        u.lang = 'zh-CN';
        window.speechSynthesis.speak(u);
      } catch {}
    });
    const offStop = api.onListen?.('tts:stop', () => {
      try { window.speechSynthesis.cancel(); } catch {}
    });
    return () => { offSpeak?.(); offStop?.(); };
  }, [isOverlay]);

  if (isOverlay) {
    return (
      <Routes>
        <Route path="/overlay-exam" element={<ExamOverlay />} />
        <Route path="/overlay-interview" element={<Overlay />} />
      </Routes>
    );
  }

  // Do not allow the login page to bypass the mandatory first-launch Mac
  // authorization flow. PermissionOnboarding is intentionally auth-free.
  if (permissionOnboardingRequired) {
    return <PermissionOnboarding onComplete={() => setPermissionOnboardingRequired(false)} />;
  }

  if (authed === null) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          正在初始化…
        </div>
      </div>
    );
  }

  // 未登录或被强制要求登录：渲染登录页（保留目标路由）
  if (!authed || forceLogin) {
    return (
      <Login
        onLogged={async () => {
          setForceLogin(false);
          setAuthed(true);
          await api.auth.getProfile().catch(() => {});
          const permissionState = await api.permissions.getState().catch(() => null) as { platform?: string; completed?: boolean } | null;
          setPermissionOnboardingRequired(permissionState?.platform === 'darwin' && permissionState.completed !== true);
        }}
      />
    );
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/exam" element={<Exam />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/extension" element={<Extension />} />
        <Route path="/profile" element={<Profile onLogout={async () => { await api.auth.logout(); setAuthed(false); }} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
  );
}
