import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

// 悬浮窗路由检测：在 React 渲染前设置背景，防止透明窗口黑屏
const hash = window.location.hash || '';
const isOverlayWindow = hash.includes('overlay-exam') || hash.includes('overlay-interview');
if (isOverlayWindow) {
  // 悬浮窗：移除所有深色背景，确保透明
  document.documentElement.classList.remove('dark');
  document.body.classList.remove('bg-slate-950', 'text-slate-100');
  document.body.style.setProperty('background', 'transparent', 'important');
  document.documentElement.style.setProperty('background', 'transparent', 'important');
} else {
  // 主窗口：恢复深色背景
  document.documentElement.classList.add('dark');
  document.body.classList.add('bg-slate-950', 'text-slate-100');
}

// ===== ErrorBoundary：捕获渲染错误，避免黑屏 =====
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[App] 渲染错误:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-300">
          <div className="text-center max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">页面渲染出错</h2>
            <p className="text-sm text-slate-400 mb-4 break-all">{this.state.error?.message}</p>
            <button
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm cursor-pointer"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ThemeProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
