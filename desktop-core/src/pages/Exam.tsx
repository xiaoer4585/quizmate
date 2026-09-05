// 笔试助手配置页 - 嵌入原考试插件 ConfigPage 核心功能
// 在 MainLayout 内渲染，不含 TitleBar；不含邀请代理和本地知识库
import { useState, useEffect, useCallback } from 'react';
import {
  Play, Square, ExternalLink, Info, Eye, EyeOff,
  Volume2, Loader2,
  AlertCircle, Copy, FolderOpen, ShieldCheck,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { defaultShortcutBindings, examOverlayShortcutActions, examVoiceShortcutActions, formatAccelerator, isMacPlatform } from '../../shared/shortcuts';
import ShortcutSettings from '../components/ShortcutSettings';
import FeatureGuide, { type FeatureGuideStep } from '../components/FeatureGuide';
import type { PermissionOnboardingState } from '../../shared/reliability';

type ProcessingMode = 'overlay' | 'voice';
interface ExamDiagnosticError {
  error?: string;
  code?: string;
  stage?: string;
  requestId?: string;
  operationId?: string;
  action?: string;
}

export default function Exam() {
  // 通过 preload 暴露的 electronAPI 兼容层调用后端（与原考试插件接口一致）
  const api = (window as any).electronAPI;
  const { theme, setTheme } = useTheme();

  // 用户/积分/版本
  const [userInfo, setUserInfo] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [version, setVersion] = useState('');

  // 悬浮窗状态
  const [overlayActive, setOverlayActive] = useState<boolean>(false); // 是否已启动
  const [overlayVisible, setOverlayVisible] = useState<boolean>(false); // 当前是否可见
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.85);

  // 工作模式
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('overlay');

  // 快捷键绑定
  const [shortcutBindings, setShortcutBindings] = useState<Record<string, string>>(defaultShortcutBindings);
  const [ttsTesting, setTtsTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<ExamDiagnosticError | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [permissionState, setPermissionState] = useState<PermissionOnboardingState | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);

  // 加载初始配置数据
  const loadData = useCallback(async () => {
    try {
      const info = await api.auth.fetchUserInfo();
      setUserInfo(info);
      const creditInfo = await api.credits.check();
      setCredits(creditInfo.available);
      const v = await api.app.getVersion();
      setVersion(v);
      const bindings = await api.config.getShortcutBindings();
      setShortcutBindings(bindings);
      // 读取透明度（主题默认 dark，由 ThemeContext 通过 getClientSettings 读取）
      const settings = await api.config.getClientSettings();
      if (settings.backgroundOpacity !== undefined) {
        setBackgroundOpacity(settings.backgroundOpacity);
      }
      const mode = await api.config.getProcessingMode();
      setProcessingMode(mode);
      if (isMacPlatform()) {
        const permissions = await api.permissions.getState().catch(() => null) as PermissionOnboardingState | null;
        setPermissionState(permissions);
      }
      // 同步悬浮框启动状态（由侧边栏菜单控制）
      const isActive = await api.app.isExamClientActive();
      setOverlayActive(!!isActive);
      setOverlayVisible(!!isActive);
    } catch (e) {
      console.error('加载笔试助手配置失败:', e);
    }
  }, [api]);

  useEffect(() => {
    loadData();
    (api as any).announcements?.get?.().then((v: any) => setAnnouncement(String(v?.exam || ''))).catch(() => {});
    // 监听后端事件
    const unsubs: Array<(() => void) | undefined> = [];
    // 积分变动
    unsubs.push(api?.on('credits-updated', (newCredits: number) => {
      setCredits(newCredits);
    }));
    // 透明度变更（悬浮框内部调节时同步）
    unsubs.push(api?.on('background-opacity-changed', (opacity: number) => {
      setBackgroundOpacity(opacity);
    }));
    // 工作模式切换
    unsubs.push(api?.on('processing-mode-changed', (data: any) => {
      setProcessingMode(data.mode);
    }));
    for (const channel of ['screenshot-error', 'solution-stream-error', 'solution-error', 'processing-unauthorized', 'processing-no-screenshots', 'out-of-credits']) {
      unsubs.push(api?.on(channel, (data: ExamDiagnosticError) => setDiagnosticError(data || { error: '处理失败' })));
    }
    unsubs.push(api?.on('solution-stream-complete', () => setDiagnosticError(null)));
    unsubs.push(api?.on('screenshot-added', () => setDiagnosticError(null)));
    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [api, loadData]);

  useEffect(() => {
    if (!isMacPlatform()) return;
    const refresh = () => api.permissions.getState().then((value: PermissionOnboardingState) => setPermissionState(value)).catch(() => {});
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, [api]);

  const guideAccount = userInfo?.email || userInfo?.username || 'current';
  const guideStorageKey = `quizmate.feature-guide.exam.${guideAccount}`;
  useEffect(() => {
    if (!userInfo) return;
    const forced = window.location.hash.includes('guide=1');
    if (forced || window.localStorage.getItem(guideStorageKey) !== 'done') setGuideOpen(true);
  }, [guideStorageKey, userInfo]);

  useEffect(() => {
    const openGuide = (event: Event) => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      if (page === 'exam') setGuideOpen(true);
    };
    window.addEventListener('quizmate:open-feature-guide', openGuide);
    return () => window.removeEventListener('quizmate:open-feature-guide', openGuide);
  }, []);

  const finishGuide = () => {
    window.localStorage.setItem(guideStorageKey, 'done');
    setGuideOpen(false);
  };

  // 启动笔试悬浮窗
  const handleStartExam = async () => {
    try {
      // 语音播报模式没有文字悬浮框，不能伪装成已启动。
      if (processingMode === 'voice') {
        setOverlayActive(false);
        setOverlayVisible(false);
        setDiagnosticError({ error: '当前为语音播报模式，无法启动笔试助手悬浮框，请切换为悬浮框文字模式后再使用。' });
        return;
      }
      if (isMacPlatform()) {
        setPermissionBusy(true);
        try {
          const checked = await api.permissions.authorizeAll() as PermissionOnboardingState;
          setPermissionState(checked);
          if (!checked?.completed) {
            setDiagnosticError({ error: '笔试助手需要屏幕录制权限。请在系统设置中允许 QuizMate 后，再点击开始使用。', code: checked?.errorCode || 'EXAM_PERMISSION_REQUIRED', stage: 'capture-permission' });
            return;
          }
        } finally {
          setPermissionBusy(false);
        }
      }
      const result = await api.app.launchExamClient();
      if (result?.success === false) {
        setDiagnosticError({ error: result.error || '无法启动笔试助手悬浮框' });
        return;
      }
      setDiagnosticError(null);
      setOverlayActive(true);
      setOverlayVisible(true);
    } catch (error) {
      // IPC/权限异常以前会让按钮看起来“无反应”；将错误显式反馈给用户。
      setDiagnosticError({ error: error instanceof Error ? error.message : '无法启动笔试助手悬浮框，请检查系统权限后重试。', code: 'EXAM_LAUNCH_FAILED', stage: 'launch' });
    } finally {
      setPermissionBusy(false);
    }
  };

  // 关闭笔试悬浮窗
  const handleCloseOverlay = async () => {
    // 语音播报模式无需关闭悬浮框
    if (processingMode === 'voice') {
      setOverlayActive(false);
      setOverlayVisible(false);
      return;
    }
    await api.app.closeExamClient();
    setOverlayActive(false);
    setOverlayVisible(false);
  };

  // 显示/隐藏悬浮窗（已启动时仅切换可见性）
  const handleToggleOverlay = async () => {
    if (!overlayActive) {
      await handleStartExam();
      return;
    }
    // 语音播报模式没有悬浮框可切换
    if (processingMode === 'voice') return;
    if (overlayVisible) {
      await api.window.hide();
      setOverlayVisible(false);
    } else {
      await api.window.show();
      setOverlayVisible(true);
    }
  };

  // 切换工作模式
  const handleSwitchMode = async (mode: ProcessingMode) => {
    if (mode === processingMode) return;
    await api.app.switchMode(mode);
    setProcessingMode(mode);
  };

  // 透明度调节
  const handleOpacityChange = async (value: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, value));
    setBackgroundOpacity(clamped);
    await api.window.setOpacity(clamped);
  };

  // 打开官网
  const handleOpenWebsite = () => {
    api.app.openExternal('https://quizmate.cn');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {announcement && <div className="card border-cyan-500/30 bg-cyan-500/5 text-sm text-cyan-200">📢 {announcement}</div>}
      {isMacPlatform() && permissionState && (
        <div className={`card ${permissionState.completed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`} data-guide-target="exam-permissions">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">笔试助手权限状态</div>
              <div className="mt-1 text-xs text-slate-300">
                屏幕录制：<span className={permissionState.screen === 'verified' ? 'text-emerald-300' : 'text-amber-300'}>{permissionState.screen}</span>
                {' · '}麦克风：<span className="text-slate-300">{permissionState.microphone}</span>
                {' · '}系统音频：<span className="text-slate-300">{permissionState.systemAudio}</span>
              </div>
              {!permissionState.completed && <div className="mt-1 text-xs text-amber-200">开始使用前必须完成授权；新安装包或签名变化后需要重新勾选 QuizMate。</div>}
            </div>
            {!permissionState.completed && (
              <button className="btn-outline text-xs shrink-0" disabled={permissionBusy} onClick={() => api.permissions.authorizeAll().then((value: PermissionOnboardingState) => setPermissionState(value)).catch(() => {})}>
                {permissionBusy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}重新授权
              </button>
            )}
          </div>
        </div>
      )}
      {/* 头部：用户信息 + 积分 + 操作按钮 */}
      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">
              {userInfo?.email || userInfo?.username || '已登录用户'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              版本 {version}
              {credits !== null && ` · 积分 `}
              {credits !== null && <span className="text-amber-400 font-bold">{credits}</span>}
            </p>
          </div>
          <div data-guide-target="exam-start" className="flex gap-2 flex-wrap justify-end items-center">
            {!overlayActive ? (
              <button onClick={handleStartExam} className="btn-exam">
                <Play size={14} /> 开始使用
              </button>
            ) : (
              <button onClick={handleCloseOverlay} className="btn-outline">
                <Square size={14} /> 关闭悬浮窗
              </button>
            )}
            <button onClick={handleOpenWebsite} className="btn-ghost">
              <ExternalLink size={14} /> 官网
            </button>
          </div>
        </div>
      </div>

      {diagnosticError && (
        <div className="card border-rose-500/30 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-rose-200">{diagnosticError.error || '处理失败'}</div>
              <div className="mt-1 text-xs text-slate-400">
                {[diagnosticError.code && `错误码 ${diagnosticError.code}`, diagnosticError.stage && `阶段 ${diagnosticError.stage}`, (diagnosticError.requestId || diagnosticError.operationId) && `请求 ${String(diagnosticError.requestId || diagnosticError.operationId).slice(0, 8)}`].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-1 text-xs text-slate-500">截图会保留在队列中；修复权限或网络后可直接再次搜题。</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="btn-outline text-xs" onClick={() => api.screenshot.copyDiagnostic()}><Copy size={12} />复制诊断</button>
              <button className="btn-ghost text-xs" onClick={() => api.screenshot.openDiagnosticFolder()}><FolderOpen size={12} />日志目录</button>
            </div>
          </div>
        </div>
      )}

      {/* 工作模式选择 */}
      <div className="card" data-guide-target="exam-mode">
        <h3 className="text-sm font-semibold mb-1">工作模式</h3>
        <p className="text-xs text-slate-400 mb-3">
          选择答案呈现方式，切换后会自动调整悬浮框与快捷键
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 悬浮框文字呈现 */}
          <button
            onClick={() => handleSwitchMode('overlay')}
            className={`text-left p-4 rounded-lg border-2 transition ${processingMode === 'overlay' ? 'border-exam bg-exam/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">悬浮框文字呈现</span>
              {processingMode === 'overlay' && (
                <span className="tag bg-exam text-white">已选</span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              先按全屏截图快捷键，再按搜题快捷键；长题可分次截图，最多 3 张后一次一起发给 AI，答案显示在悬浮框
            </p>
          </button>
          {/* 语音播报 */}
          <button
            onClick={() => handleSwitchMode('voice')}
            className={`text-left p-4 rounded-lg border-2 transition ${processingMode === 'voice' ? 'border-exam bg-exam/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">语音播报</span>
              {processingMode === 'voice' && (
                <span className="tag bg-exam text-white">已选</span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              按语音播报搜题快捷键（默认 {formatAccelerator(defaultShortcutBindings.voice_search)}），即可自动截图、搜题并播报答案
            </p>
            {processingMode === 'voice' && (
              <p className="text-xs mt-1 text-exam font-medium">
                当前快捷键：{formatAccelerator(shortcutBindings.voice_search || defaultShortcutBindings.voice_search)}
              </p>
            )}
          </button>
        </div>
      </div>

      {/* 悬浮框控制（仅 overlay 模式）：显示开关 + 透明度滑块 */}
      {processingMode === 'overlay' && (
        <div className="card" data-guide-target="exam-overlay-settings">
          <h3 className="text-sm font-semibold mb-3">悬浮框控制</h3>
          <div className="flex items-center gap-6 flex-wrap">
            {/* 显示/隐藏开关 */}
            <div className="flex items-center gap-3 shrink-0">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {overlayVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                  悬浮框显示
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {overlayActive ? (overlayVisible ? '已显示' : '已隐藏') : '未启动'}
                </div>
              </div>
              <button
                onClick={handleToggleOverlay}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${overlayVisible ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${overlayVisible ? 'translate-x-6' : ''}`} />
              </button>
            </div>
            {/* 分隔线 */}
            <div className="w-px h-10 bg-slate-700 hidden md:block"></div>
            {/* 透明度滑块 */}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">背景透明度</span>
                <span className="text-xs text-slate-400">
                  {Math.round(backgroundOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={backgroundOpacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-exam"
              />
              <div className="flex justify-between text-xs mt-1 text-slate-500">
                <span>透明</span>
                <span>不透明</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮框主题（仅 overlay 模式） */}
      {processingMode === 'overlay' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">悬浮框主题</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 p-4 rounded-lg border-2 transition ${theme === 'dark' ? 'border-exam bg-slate-800' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}`}
            >
              <div className="w-full h-12 bg-slate-900 rounded mb-2"></div>
              <div className="text-sm font-medium">黑色主题</div>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 p-4 rounded-lg border-2 transition ${theme === 'light' ? 'border-exam bg-slate-800' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}`}
            >
              <div className="w-full h-12 bg-white border rounded mb-2"></div>
              <div className="text-sm font-medium">白色主题 <span className="text-xs text-emerald-400">推荐</span></div>
            </button>
          </div>
        </div>
      )}

      {/* 语音播报设置（仅 voice 模式） */}
      {processingMode === 'voice' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">语音播报设置</h3>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              语音播报使用系统内置语音引擎，无需额外配置。如需调整语速或音色，请在 Windows 设置 - 时间和语言 - 语音中管理。
            </p>
            <button
              onClick={async () => {
                if (ttsTesting) return;
                setTtsTesting(true);
                try {
                  await api.tts.speak('这是一段测试文本，用于试听语音效果。');
                } catch {}
                setTtsTesting(false);
              }}
              disabled={ttsTesting}
              className="btn-outline text-xs"
            >
              {ttsTesting ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
              {ttsTesting ? '播报中...' : 'TTS 试听'}
            </button>
          </div>
        </div>
      )}

      <div data-guide-target="exam-shortcuts">
        <ShortcutSettings
          commonActions={processingMode === 'overlay' ? examOverlayShortcutActions : examVoiceShortcutActions}
          bindings={shortcutBindings}
          onBindingsChange={setShortcutBindings}
          accentClass="bg-exam"
        />
      </div>

      {/* 操作提示 */}
      <div className="card bg-slate-900/40">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Info size={16} /> 操作提示
        </h3>
        <ul className="text-sm text-slate-300 space-y-2">
            {processingMode === 'overlay' ? (
              <>
                <li>· 点击「开始使用」启动笔试悬浮框，或按 {formatAccelerator(shortcutBindings.toggle_visibility || defaultShortcutBindings.toggle_visibility)} 快捷键启动/切换</li>
                <li>· 拖动悬浮框顶部提示栏可移动位置</li>
                <li>· 拖动悬浮框四边或四角可调整大小</li>
                <li>· 使用「悬浮框显示」开关或 {formatAccelerator(shortcutBindings.toggle_visibility || defaultShortcutBindings.toggle_visibility)} 快捷键可显示/隐藏悬浮框</li>
              </>
            ) : (
              <li className="text-red-400">· 语音播报模式无法启动笔试助手悬浮框；如需截图和查看文字答案，请先切换为悬浮框文字模式</li>
            )}
            <li>· 透明度可通过上方进度条实时调节</li>
            {processingMode === 'overlay' && (
              <li>· 题目太长时可分次截图，最多 3 张后按 {formatAccelerator(shortcutBindings.search || defaultShortcutBindings.search)} 一次搜题，AI 会一起分析当前截图队列</li>
            )}
            {processingMode === 'voice' && (
              <li>· 语音播报模式下，按 {formatAccelerator(shortcutBindings.voice_search || defaultShortcutBindings.voice_search)} 即可完成截图+分析+播报全流程</li>
            )}
          {processingMode === 'voice' && (
            <li>· 按 {formatAccelerator(shortcutBindings.replay || defaultShortcutBindings.replay)} 可重听上次答案</li>
          )}
        </ul>
      </div>

      <FeatureGuide
        open={guideOpen}
        title={processingMode === 'voice' ? '笔试助手 · 语音播报模式' : '笔试助手 · 悬浮框文字模式'}
        steps={(processingMode === 'voice' ? [
          { title: '选择语音播报模式并确认快捷键', description: '选择“语音播报”。下方常用快捷键中重点确认“语音播报搜题”和“重听答案”，需要修改时点击对应的更改按钮。', target: '[data-guide-target="exam-mode"]' },
          { title: '开始使用', description: '点击“开始使用”启用笔试助手。语音播报模式不会打开文字悬浮框。', target: '[data-guide-target="exam-start"]' },
          { title: '启动搜题', description: `按 ${formatAccelerator(shortcutBindings.voice_search || defaultShortcutBindings.voice_search)} 即可自动完成全屏截图、识别题目、生成答案和语音播报，不需要先按全屏截图。`, target: '[data-guide-target="shortcut-voice_search"]' },
          { title: '重听答案', description: `没有听清时按 ${formatAccelerator(shortcutBindings.replay || '重听快捷键')}，可重新播报上一条答案。`, target: '[data-guide-target="shortcut-replay"]' },
        ] : [
          { title: '选择工作模式并设置常用快捷键', description: '选择“悬浮框文字呈现”。下方常用快捷键可以逐项修改，重点确认全屏截图、搜题和显示/隐藏悬浮框。', target: '[data-guide-target="exam-mode"]' },
          { title: '开始使用', description: '点击“开始使用”打开笔试悬浮框。之后主要通过快捷键操作，不需要切回客户端。', target: '[data-guide-target="exam-start"]' },
          { title: '先全屏截图', description: `题目完整显示后，先按 ${formatAccelerator(shortcutBindings.screenshot || '全屏截图快捷键')} 保存当前题目截图；长题可分次截图，最多 3 张。`, target: '[data-guide-target="shortcut-screenshot"]' },
          { title: '再启动搜题', description: `截图完成后，再按 ${formatAccelerator(shortcutBindings.search || '搜题快捷键')}。AI 会一次分析当前截图队列，答案显示在悬浮框中。`, target: '[data-guide-target="shortcut-search"]' },
          { title: '按需设置悬浮框', description: '可在这里显示或隐藏悬浮框，并调整透明度；下方还能切换深色或浅色主题。', target: '[data-guide-target="exam-overlay-settings"]' },
        ]) as FeatureGuideStep[]}
        onClose={finishGuide}
        onComplete={finishGuide}
      />
    </div>
  );
}
