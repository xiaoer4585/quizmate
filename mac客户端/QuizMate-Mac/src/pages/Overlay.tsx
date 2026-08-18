// 面试悬浮窗 - 完全鼠标穿透（与笔试悬浮窗一致）
// 左侧：问题列表 | 右侧：AI 回答（结合简历）
// 快捷键: Ctrl+B 显隐 / Ctrl+方向键 移动 / Ctrl+Shift+方向键 缩放
import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Mic, Sparkles } from 'lucide-react';
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
          setTasks(existingTasks);
          tasksRef.current = existingTasks;
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
      const nextTasks = Array.isArray(data) ? data : [];
      const currentId = tasksRef.current[selectedIndexRef.current]?.id;
      let nextIndex = 0;
      if (userNavigatedRef.current && currentId) {
        const preserved = nextTasks.findIndex((task: InterviewTask) => task.id === currentId);
        if (preserved >= 0) nextIndex = preserved;
      } else if (nextTasks[0]?.status === 'skipped') {
        const latestValid = nextTasks.findIndex((task: InterviewTask) => task.status !== 'skipped');
        nextIndex = latestValid >= 0 ? latestValid : 0;
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

  return (
    <div className="w-full h-full p-1.5" style={{ background: 'transparent', pointerEvents: 'none' }}>
      <InterviewOverlayStyles />
      <div
        className="w-full h-full flex flex-col overflow-hidden rounded-lg"
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          boxShadow: theme === 'dark' ? '0 12px 32px rgba(0,0,0,0.3)' : '0 12px 32px rgba(15,23,42,0.14)',
          color: textColor,
          pointerEvents: 'none',
        }}
      >
        <header className="h-11 flex items-center gap-2.5 px-3 border-b shrink-0" style={{ borderColor }}>
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.14)', color: accentColor }}>
            <Mic size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-none">面试助手</div>
            <div className="text-[9px] mt-1" style={{ color: subTextColor }}>{listening ? '正在听写，自动识别问题' : '已停止听写'}</div>
          </div>
          <div className="flex-1" />
          {listening && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: accentColor }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: accentColor }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accentColor }} />
              </span>
              自动识别问题
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[9px]" style={{ color: subTextColor }}>
            <span className="px-1.5 py-0.5 rounded" style={{ background: audioMode === 'formal' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.16)', color: audioMode === 'formal' ? '#6ee7b7' : '#fcd34d' }}>
              {audioMode === 'formal' ? '正式：仅扬声器' : '演示：麦克风+扬声器'}
            </span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: panelColor }}>问题 {tasks.length}</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: panelColor }}>完成 {doneCount}</span>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-[minmax(130px,36%)_1fr] min-h-0">
          <section className="min-w-0 overflow-y-auto p-2.5 border-r" style={{ borderColor }}>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[10px] font-semibold" style={{ color: subTextColor }}>问题流</span>
              {pendingCount > 0 && <span className="text-[9px]" style={{ color: accentColor }}>{pendingCount} 条处理中</span>}
            </div>
            {interimText && (
              <div className="mb-2 p-2 rounded-md border text-[10px] leading-relaxed" style={{ color: subTextColor, background: panelColor, borderColor }}>
                <div className="text-[9px] font-medium mb-1" style={{ color: accentColor }}>正在识别</div>
                {interimText}
              </div>
            )}
            {tasks.length === 0 ? (
              <div className="h-full min-h-24 flex items-center justify-center text-center px-3">
                <div className="text-[10px] leading-relaxed" style={{ color: subTextColor }}>
                  {statusMessage?.content || (listening ? '等待面试官提问，识别到问题后自动生成答案' : '尚未开始听写')}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tasks.map((task, idx) => (
                  <button key={task.id} onClick={() => { setSelectedIndex(idx); selectedIndexRef.current = idx; userNavigatedRef.current = idx !== 0; }} className="w-full text-left p-2 rounded-md border" style={{ background: idx === selectedIndex ? 'rgba(244,63,94,0.08)' : panelColor, borderColor: idx === selectedIndex ? 'rgba(244,63,94,0.28)' : borderColor }}>
                    <div className="flex items-start gap-1.5">
                      <span className="text-[9px] font-mono mt-0.5" style={{ color: idx === 0 ? accentColor : subTextColor }}>{String(tasks.length - idx).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1 text-[10px] font-medium leading-relaxed">{task.question}</div>
                      {task.status === 'done' ? <CheckCircle2 size={11} color="#10b981" className="shrink-0 mt-0.5" /> : task.status === 'error' ? <AlertCircle size={11} color="#ef4444" className="shrink-0 mt-0.5" /> : <Clock3 size={11} color={accentColor} className="shrink-0 mt-0.5" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-y-auto p-3">
            <div className="flex items-center gap-1.5 mb-2" style={{ color: subTextColor }}>
              <Sparkles size={12} />
              <span className="text-[10px] font-semibold">参考回答</span>
            </div>
            {!latestTask ? (
              <div className="h-full min-h-28 flex items-center justify-center text-[10px]" style={{ color: subTextColor }}>
                {listening ? '识别到完整问题后将在此生成答案' : '答案将在此显示'}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="pb-2 border-b text-[11px] font-semibold leading-relaxed" style={{ borderColor }}>
                  {latestTask.question}
                </div>
                {latestTask.status === 'pending' && <div className="text-[10px]" style={{ color: subTextColor }}>等待生成</div>}
                {latestTask.status === 'streaming' && (
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: accentColor }}>
                    <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    正在生成回答
                  </div>
                )}
                {latestTask.status === 'error' && <div className="text-[10px] text-red-400">{latestTask.error}</div>}
                {latestTask.status === 'skipped' && <div className="text-[10px]" style={{ color: subTextColor }}>已识别为求职者回答，跳过 AI 生成</div>}
                {latestTask.answer && <div className="text-[11px] leading-[1.65] whitespace-pre-wrap">{latestTask.answer}</div>}
              </div>
            )}
          </section>
        </main>

        <footer className="h-7 flex items-center justify-between px-3 border-t text-[9px] shrink-0" style={{ borderColor, color: subTextColor }}>
          <span>{listening ? '语音流已连接' : '语音流未启动'}</span>
          <span>{pendingCount > 0 ? `${pendingCount} 条回答生成中` : doneCount > 0 ? `已完成 ${doneCount} 条问答` : '等待问题'}</span>
        </footer>
      </div>
    </div>
  );
}
