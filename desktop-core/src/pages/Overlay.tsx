// 面试悬浮窗 - 完全鼠标穿透（与笔试悬浮窗一致）
// 左侧：问题列表 | 右侧：AI 回答（结合简历）
// 快捷键: Windows Alt+R / macOS Option+R 开始或结束面试；窗口调节键作用于最近启动的悬浮窗
import { useState, useEffect, useRef } from 'react';
import { AlertCircle, AudioLines, CheckCircle2, Clock3, ListTree, Mic, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { defaultShortcutBindings } from '../../shared/shortcuts';

function InterviewOverlayStyles() {
  return (
    <style>{`
      html, body, #root { background: transparent !important; margin: 0; padding: 0; height: 100%; overflow: hidden; }
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.28); border-radius: 2px; }
      .interview-timeline-scroll, .interview-answer-scroll { scrollbar-gutter: stable; }
      .interview-answer-scroll { overscroll-behavior: contain; }
    `}</style>
  );
}

interface InterviewTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: 'pending' | 'streaming' | 'done' | 'error' | 'skipped';
  ts: number;
}

interface OverlayPayload {
  type: 'exam' | 'interview';
  title?: string;
  content: string;
  streaming?: boolean;
}

export default function Overlay() {
  const electronAPI = (window as any).electronAPI;
  const api = (window as any).api;
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<InterviewTask[]>([]);
  const [statusMessage, setStatusMessage] = useState<OverlayPayload | null>(null);
  const [listening, setListening] = useState(false);
  const [audioMode, setAudioMode] = useState<'demo' | 'formal'>('demo');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tasksRef = useRef<InterviewTask[]>([]);
  const selectedIndexRef = useRef(0);
  const userNavigatedRef = useRef(false);
  const [interimText, setInterimText] = useState('');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.85);
  const [shortcutBindings, setShortcutBindings] = useState<Record<string, string>>(defaultShortcutBindings);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const settings = await electronAPI.config.getClientSettings();
        if (settings.backgroundOpacity !== undefined) {
          setBackgroundOpacity(settings.backgroundOpacity);
        }
        const existingTasks = await api.interview.getTasks();
        if (Array.isArray(existingTasks) && existingTasks.length > 0) {
          const visibleTasks = existingTasks.filter((task: InterviewTask) => task.status !== 'skipped');
          setTasks(visibleTasks);
          tasksRef.current = visibleTasks;
        }
        setShortcutBindings(await electronAPI.config.getShortcutBindings());
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }
    };
    loadInitial();
  }, [electronAPI, api]);

  useEffect(() => {
    const unsubs: Array<(() => void) | undefined> = [];

    unsubs.push(electronAPI?.on('overlay:renderTasks', (data: any) => {
      const nextTasks = (Array.isArray(data) ? data : []).filter((task: InterviewTask) => task.status !== 'skipped');
      const currentId = tasksRef.current[selectedIndexRef.current]?.id;
      let nextIndex = 0;
      if (userNavigatedRef.current && currentId) {
        const preserved = nextTasks.findIndex((task: InterviewTask) => task.id === currentId);
        if (preserved >= 0) nextIndex = preserved;
      }
      tasksRef.current = nextTasks;
      selectedIndexRef.current = nextIndex;
      setTasks(nextTasks);
      setSelectedIndex(nextIndex);
      setStatusMessage(null);
    }));

    unsubs.push(electronAPI?.on('overlay:render', (data: any) => {
      setStatusMessage(data);
    }));

    unsubs.push(electronAPI?.on('overlay:clear', () => {
      setTasks([]);
      tasksRef.current = [];
      selectedIndexRef.current = 0;
      userNavigatedRef.current = false;
      setSelectedIndex(0);
      setStatusMessage(null);
    }));

    unsubs.push(electronAPI?.on('interview:transcript', (data: any) => {
      if (data?.status === 'started') {
        setListening(true);
        setAudioMode(data.context?.audioMode === 'formal' ? 'formal' : 'demo');
      }
      if (data?.status === 'stopped') { setListening(false); setInterimText(''); }
      if (data?.committed) setInterimText('');
      else if (data?.text) setInterimText(data.text);
    }));

    unsubs.push(electronAPI?.on('interview:navigate', (data: any) => {
      setSelectedIndex((current) => {
        const max = Math.max(0, tasks.length - 1);
        const next = data?.direction === 'prev' ? Math.max(0, current - 1) : Math.min(max, current + 1);
        selectedIndexRef.current = next;
        userNavigatedRef.current = next !== 0;
        return next;
      });
    }));

    unsubs.push(electronAPI?.on('background-opacity-changed', (opacity: number) => {
      setBackgroundOpacity(opacity);
    }));

    unsubs.push(electronAPI?.on('shortcuts:updated', (bindings: Record<string, string>) => {
      setShortcutBindings(bindings);
    }));

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [electronAPI, tasks.length]);

  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'streaming').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  const bgColor = theme === 'dark'
    ? `rgba(18, 21, 29, ${backgroundOpacity})`
    : `rgba(255, 255, 255, ${backgroundOpacity})`;
  const textColor = theme === 'dark' ? '#f1f5f9' : '#172033';
  const subTextColor = theme === 'dark' ? '#94a3b8' : '#59647a';
  const borderColor = theme === 'dark' ? 'rgba(148,163,184,0.18)' : 'rgba(71,85,105,0.18)';
  const panelColor = theme === 'dark' ? 'rgba(2,6,23,0.24)' : 'rgba(241,245,249,0.62)';
  const accentColor = '#f43f5e';

  // 取最新的任务作为右侧焦点（倒序，第一个是最新）
  const latestTask = tasks[selectedIndex] || tasks[0];
  const latestStatus = latestTask?.status;
  const latestStatusLabel = latestStatus === 'done' ? '回答完成' : latestStatus === 'error' ? '生成失败' : latestStatus === 'streaming' ? '正在生成回答' : latestStatus === 'pending' ? '等待生成' : '已识别';
  const latestStatusColor = latestStatus === 'done' ? '#34d399' : latestStatus === 'error' ? '#f87171' : latestStatus === 'streaming' || latestStatus === 'pending' ? '#fbbf24' : subTextColor;

  return (
    <div className="w-full h-full p-1.5" style={{ background: 'transparent', pointerEvents: 'none' }}>
      <InterviewOverlayStyles />
      <div
        className="w-full h-full flex flex-col overflow-hidden rounded-xl"
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          boxShadow: 'none',
          color: textColor,
          pointerEvents: 'none',
        }}
      >
        <header className="h-14 flex items-center gap-3 px-4 border-b shrink-0" style={{ borderColor }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.14)', color: accentColor }}>
            <Mic size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-none tracking-wide">面试工作台</div>
            <div className="text-[10px] mt-1.5" style={{ color: subTextColor }}>{listening ? '正在听写，自动识别问题' : '已停止听写'}</div>
          </div>
          <div className="flex-1" />
          {listening && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium mr-1" style={{ color: accentColor }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: accentColor }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accentColor }} />
              </span>
              语音流正常
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: subTextColor }}>
            <span className="px-2 py-1 rounded-md" style={{ background: audioMode === 'formal' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.16)', color: audioMode === 'formal' ? '#6ee7b7' : '#fcd34d' }}>
              {audioMode === 'formal' ? '正式面试 · 仅扬声器' : '演示模式 · 麦克风 + 扬声器'}
            </span>
            <span className="px-2 py-1 rounded-md" style={{ background: panelColor }}>问题 {String(tasks.length).padStart(2, '0')}</span>
            <span className="px-2 py-1 rounded-md" style={{ background: panelColor }}>完成 {String(doneCount).padStart(2, '0')}</span>
          </div>
        </header>
        <main className="flex-1 grid grid-cols-[minmax(190px,30%)_minmax(0,70%)] min-h-0">
          <section className="interview-timeline-scroll min-w-0 overflow-y-auto p-3 border-r" style={{ borderColor }}>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: subTextColor }}><ListTree size={13} />问题时间线</span>
              {pendingCount > 0 && <span className="text-[10px]" style={{ color: '#fbbf24' }}>{pendingCount} 条处理中</span>}
            </div>
            {tasks.length === 0 ? (
              <div className="h-full min-h-24 flex items-center justify-center text-center px-3">
                <div className="text-[11px] leading-relaxed" style={{ color: subTextColor }}>
                  {statusMessage?.content || (listening ? '等待面试官提问，识别到问题后自动生成答案' : '尚未开始听写')}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tasks.map((task, idx) => (
                  <button key={task.id} onClick={() => { setSelectedIndex(idx); selectedIndexRef.current = idx; userNavigatedRef.current = idx !== 0; }} className="w-full text-left p-2.5 rounded-lg border" style={{ background: idx === selectedIndex ? 'rgba(244,63,94,0.08)' : panelColor, borderColor: idx === selectedIndex ? 'rgba(244,63,94,0.28)' : borderColor }}>
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-mono mt-0.5" style={{ color: idx === 0 ? accentColor : subTextColor }}>{String(tasks.length - idx).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium leading-relaxed line-clamp-2">{task.question}</div>
                        <div className="mt-1 text-[9px]" style={{ color: task.status === 'done' ? '#34d399' : task.status === 'error' ? '#f87171' : '#fbbf24' }}>{task.status === 'done' ? '已完成' : task.status === 'error' ? '生成失败' : task.status === 'streaming' ? '回答生成中' : '等待生成'}</div>
                      </div>
                      {task.status === 'done' ? <CheckCircle2 size={12} color="#34d399" className="shrink-0 mt-0.5" /> : task.status === 'error' ? <AlertCircle size={12} color="#f87171" className="shrink-0 mt-0.5" /> : <Clock3 size={12} color="#fbbf24" className="shrink-0 mt-0.5" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {interimText && (
              <div className="mt-3 p-2.5 rounded-lg border text-[10px] leading-relaxed" style={{ color: subTextColor, background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.24)' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-medium mb-1.5" style={{ color: '#fbbf24' }}><AudioLines size={12} />正在识别 · 仅预览</div>
                <div className="max-h-20 overflow-hidden">{interimText}</div>
              </div>
            )}
          </section>

          <section className="interview-answer-scroll min-w-0 overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2" style={{ color: subTextColor }}>
                <Sparkles size={14} />
                <span className="text-[11px] font-semibold">当前回答</span>
              </div>
              {latestTask && <span className="text-[10px] font-medium" style={{ color: latestStatusColor }}>{latestStatusLabel}</span>}
            </div>
            {!latestTask ? (
              <div className="h-full min-h-28 flex items-center justify-center text-[11px]" style={{ color: subTextColor }}>
                {listening ? '识别到完整问题后将在此生成答案' : '答案将在此显示'}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="pb-3 border-b text-[13px] font-semibold leading-7" style={{ borderColor }}>
                  {latestTask.question}
                </div>
                {latestTask.status === 'pending' && <div className="text-[11px]" style={{ color: subTextColor }}>问题已整理，等待生成回答</div>}
                {latestTask.status === 'streaming' && (
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: '#fbbf24' }}>
                    <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />正在生成回答，界面会保持稳定
                  </div>
                )}
                {latestTask.status === 'error' && <div className="text-[11px] text-red-400">{latestTask.error}</div>}
                {latestTask.status === 'skipped' && <div className="text-[11px]" style={{ color: subTextColor }}>已识别为求职者回答，跳过 AI 生成</div>}
                {latestTask.answer && <div className="text-[13px] leading-7 whitespace-pre-wrap break-words">{latestTask.answer}</div>}
                <div className="flex flex-wrap gap-2">
                  {latestTask.keyPoints?.slice(0, 5).map((point) => <span key={point} className="px-2.5 py-1 rounded-md text-[10px]" style={{ background: 'rgba(82,196,220,0.12)', color: '#8ed9e8' }}>{point}</span>)}
                  {!latestTask.keyPoints?.length && <span className="px-2.5 py-1 rounded-md text-[10px]" style={{ background: panelColor, color: subTextColor }}>{audioMode === 'formal' ? '正式面试 · 仅扬声器' : '演示模式 · 麦克风 + 扬声器'}</span>}
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className="h-9 flex items-center justify-between px-4 border-t text-[10px] shrink-0" style={{ borderColor, color: subTextColor }}>
          <span>{listening ? '语音流已连接' : '语音流未启动'}　·　Alt+B 显示/隐藏　·　Alt+R 结束面试</span>
          <span>{pendingCount > 0 ? `${pendingCount} 条回答生成中` : doneCount > 0 ? `已完成 ${doneCount} 条问答` : '等待问题'}</span>
        </footer>
      </div>
    </div>
  );
}
