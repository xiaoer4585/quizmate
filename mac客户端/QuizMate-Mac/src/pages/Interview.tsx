// 面试助手 - 配置页（主窗口中）
// 功能：配置面试上下文、上传简历、启动悬浮窗、查看历史 QA 记录
// 语音识别通过主进程连接后台配置的实时语音模型
import { useEffect, useState } from 'react';
import { Mic, MicOff, Loader2, ShieldCheck, Trash2, Sparkles, FileText, Upload, CheckCircle2, Circle, Monitor, Share2, History, Send, Keyboard } from 'lucide-react';
import { api, useProfile } from '../lib/ipc';
import ShareInterviewModal from '../components/ShareInterviewModal';
import ShortcutSettings from '../components/ShortcutSettings';
import { defaultShortcutBindings, interviewShortcutActions } from '../../shared/shortcuts';

interface HistoryTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: 'pending' | 'streaming' | 'done' | 'error';
  ts: number;
}

interface InterviewResume {
  id: string;
  name: string;
  text: string;
  uploadedAt: string;
}

export default function Interview() {
  const { data: profile } = useProfile();
  const [listening, setListening] = useState(false);
  const [context, setContext] = useState({ position: '', company: '', jobDescription: '', answerStyle: 'concise' as 'concise' | 'detailed' });
  const [error, setError] = useState('');

  // 手动输入问题
  const [manualQuestion, setManualQuestion] = useState('');
  const [manualSending, setManualSending] = useState(false);

  // 历史记录
  const [historyTasks, setHistoryTasks] = useState<HistoryTask[]>([]);

  // 简历管理
  const [resumes, setResumes] = useState<InterviewResume[]>([]);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shortcutBindings, setShortcutBindings] = useState<Record<string, string>>(defaultShortcutBindings);

  const refreshResumes = async () => {
    const list = await api.interview.listResumes();
    setResumes(list as InterviewResume[] || []);
    const active = await api.interview.getActiveResume();
    setActiveResumeId((active as InterviewResume)?.id || null);
  };

  const refreshHistory = async () => {
    const tasks = await api.interview.getTasks();
    setHistoryTasks((tasks as HistoryTask[]) || []);
  };

  useEffect(() => {
    refreshResumes().catch(() => {});
    refreshHistory().catch(() => {});
    api.interview.isOverlayActive().then(setOverlayActive).catch(() => {});
    api.exam.getShortcutBindings().then(setShortcutBindings).catch(() => {});
    return () => {};
  }, []);

  // 监听任务更新，刷新历史记录
  useEffect(() => {
    const offAdded = api.interview.onTaskAdded(() => refreshHistory());
    const offUpdated = api.interview.onTaskUpdated(() => refreshHistory());
    const offCleared = api.interview.onTasksCleared(() => setHistoryTasks([]));
    return () => { offAdded?.(); offUpdated?.(); offCleared?.(); };
  }, []);

  // 监听听写状态变化（主进程通知）
  useEffect(() => {
    const off = api.interview.onTranscript((data: any) => {
      if (data?.status === 'started') {
        setListening(true);
        setError('');
      } else if (data?.status === 'stopped') {
        setListening(false);
      } else if (data?.error) {
        setError(data.error);
      }
    });
    return () => { off?.(); };
  }, []);

  // 启动/关闭面试悬浮窗
  const toggleOverlay = async () => {
    if (overlayActive) {
      await api.interview.closeOverlay();
      setOverlayActive(false);
    } else {
      await api.interview.createOverlay();
      setOverlayActive(true);
    }
  };

  const onUpload = async () => {
    setUploading(true);
    try {
      const fp = await api.interview.pickResumeFile();
      if (!fp) { setUploading(false); return; }
      const r = await api.interview.uploadResume(fp);
      if ((r as any)?.error) setError((r as any).error);
      else await refreshResumes();
    } finally { setUploading(false); }
  };
  const onDelete = async (id: string) => {
    if (!confirm('删除该简历？')) return;
    await api.interview.deleteResume(id);
    if (activeResumeId === id) setActiveResumeId(null);
    await refreshResumes();
  };
  const onSetActive = async (id: string | null) => {
    await api.interview.setActiveResume(id);
    setActiveResumeId(id);
  };

  const credits = profile?.creditBalance ?? profile?.account?.credits ?? 0;

  // ===== 实时语音识别（通过主进程） =====
  const startListening = async () => {
    setError('');
    try {
      await api.interview.startListening(context);
      setListening(true);
    } catch (e: any) {
      setError(e?.message || '启动语音识别失败');
    }
  };

  const stopListening = async () => {
    try {
      await api.interview.stopListening();
    } catch {}
    setListening(false);
  };

  const clearHistory = async () => {
    if (!confirm('清空所有历史 QA 记录？')) return;
    await api.interview.clearTasks();
    setHistoryTasks([]);
  };

  // 手动输入问题提交
  const handleManualSubmit = async () => {
    const q = manualQuestion.trim();
    if (!q || q.length < 4) return;
    setManualSending(true);
    try {
      // 确保面试助手已启动（设置上下文）
      if (!listening) {
        await api.interview.startListening(context);
        setListening(true);
      }
      api.interview.setContext(context);
      await api.interview.transcript(q);
      setManualQuestion('');
    } catch (e: any) {
      setError(e?.message || '提交问题失败');
    } finally {
      setManualSending(false);
    }
  };

  // 转换历史记录为分享弹窗所需格式
  const shareQaList = historyTasks.map((t, i) => ({
    id: i,
    question: t.question,
    answer: t.answer,
    keyPoints: t.keyPoints,
    error: t.error,
    pending: t.status !== 'done',
    ts: t.ts,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mic size={22} className="text-rose-400" /> 面试助手
          </h1>
          <p className="text-sm text-slate-400 mt-1">实时听写面试官问题 · AI 秒出参考答案 · 结合简历作答 · 窗口隐身防录屏</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs">
            积分余额 <span className="text-amber-400 font-bold">{credits}</span>
            <span className="text-slate-500 ml-2">（每次AI作答消耗30积分）</span>
          </div>
          <button onClick={toggleOverlay} className={`btn-outline text-xs ${overlayActive ? 'text-emerald-400 border-emerald-500/50' : ''}`} title="启动/关闭面试悬浮窗">
            <Monitor size={14} /> {overlayActive ? '悬浮窗已开' : '启动悬浮窗'}
          </button>
        </div>
      </div>

      {/* 上下文配置 */}
      <div className="card">
        <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><Sparkles size={12} /> 设置面试上下文，让答案更精准</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">岗位描述</label>
            <textarea className="input min-h-20 resize-y" placeholder="粘贴 JD、职责和任职要求" value={context.jobDescription}
              onChange={(e) => setContext({ ...context, jobDescription: e.target.value })} disabled={listening} />
          </div>
          <div>
            <label className="label">应聘岗位</label>
            <input className="input" placeholder="如：Java 后端开发" value={context.position}
              onChange={(e) => setContext({ ...context, position: e.target.value })} disabled={listening} />
          </div>
          <div>
            <label className="label">面试公司</label>
            <input className="input" placeholder="如：字节跳动" value={context.company}
              onChange={(e) => setContext({ ...context, company: e.target.value })} disabled={listening} />
          </div>
          <div>
            <label className="label">答案风格</label>
            <select className="input" value={context.answerStyle}
              onChange={(e) => setContext({ ...context, answerStyle: e.target.value as any })} disabled={listening}>
              <option value="concise">简洁要点</option>
              <option value="detailed">详细展开</option>
            </select>
          </div>
        </div>
      </div>

      {/* 简历管理 - 结合简历作答 */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400 flex items-center gap-1.5"><FileText size={12} /> 上传简历，AI 将结合你的经历作答</div>
          <button onClick={onUpload} disabled={uploading} className="btn-outline text-xs">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 上传简历
          </button>
        </div>
        <div className="text-[11px] text-slate-500 mb-2">支持 txt/md（PDF/Word 需后端解析）。已上传 {resumes.length} 份，选择一份作为当前作答依据。</div>
        {resumes.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 text-center bg-slate-900/30 rounded-lg">尚未上传简历，AI 将基于通用知识作答</div>
        ) : (
          <div className="space-y-1.5">
            {resumes.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 p-2 rounded-lg border ${activeResumeId === r.id ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-700 bg-slate-900/30'}`}>
                <button onClick={() => onSetActive(activeResumeId === r.id ? null : r.id)} className="flex items-center gap-2 flex-1 text-left">
                  {activeResumeId === r.id ? <CheckCircle2 size={14} className="text-rose-400" /> : <Circle size={14} className="text-slate-600" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{r.name}</div>
                    <div className="text-[10px] text-slate-500">上传于 {new Date(r.uploadedAt).toLocaleString()}</div>
                  </div>
                </button>
                <button onClick={() => onDelete(r.id)} className="btn-ghost text-xs text-rose-400"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 控制台 */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          {!listening ? (
            <button onClick={startListening} className="btn bg-rose-500 hover:bg-rose-600 text-white">
              <Mic size={16} /> 开始听写
            </button>
          ) : (
            <button onClick={stopListening} className="btn-outline border-rose-500/50 text-rose-400">
              <MicOff size={16} /> 停止听写
            </button>
          )}
          {listening && (
            <div className="flex items-center gap-2 text-sm text-rose-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              正在监听… 实时答案在悬浮窗中显示
            </div>
          )}
          {historyTasks.length > 0 && (
            <button onClick={() => setShowShareModal(true)} className="btn-outline text-xs ml-auto" title="生成面经图片分享">
              <Share2 size={14} /> 生成面经
            </button>
          )}
          {historyTasks.length > 0 && (
            <button onClick={clearHistory} className="btn-ghost text-xs">
              <Trash2 size={14} /> 清空记录
            </button>
          )}
        </div>

        {/* 手动输入问题 - 不依赖语音识别 */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          <Keyboard size={14} className="text-slate-500 shrink-0" />
          <input
            className="input flex-1"
            placeholder="手动输入面试官的问题，按回车提交…"
            value={manualQuestion}
            onChange={(e) => setManualQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !manualSending) { e.preventDefault(); handleManualSubmit(); } }}
            disabled={manualSending}
          />
          <button onClick={handleManualSubmit} disabled={manualSending || manualQuestion.trim().length < 4} className="btn-primary text-sm shrink-0">
            {manualSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 提问
          </button>
        </div>
        <div className="text-[11px] text-slate-500 pl-5">实时语音识别由后台统一配置，识别效果不理想时可手动输入问题</div>
      </div>

      <ShortcutSettings
        commonActions={interviewShortcutActions}
        bindings={shortcutBindings}
        onBindingsChange={setShortcutBindings}
        accentClass="bg-rose-500"
      />

      {/* 隐身提示 */}
      <div className="card bg-emerald-500/5 border-emerald-500/20 flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-400" />
        <span className="text-xs text-emerald-300">隐身保护已启用：悬浮窗对屏幕共享、录屏软件、远程桌面不可见，可放心使用。</span>
      </div>

      {error && (
        <div className="card border-rose-500/30 bg-rose-500/5 text-sm text-rose-300">{error}</div>
      )}

      {/* 历史 QA 记录 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <History size={14} className="text-slate-400" />
          <span className="text-sm font-medium">历史 QA 记录</span>
          <span className="text-xs text-slate-500">({historyTasks.length} 条)</span>
        </div>
        {historyTasks.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-8">
            暂无历史记录，启动悬浮窗并开始听写后，QA 记录将显示在此处
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {historyTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-slate-700 bg-slate-900/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="tag bg-rose-500/15 text-rose-400 mt-0.5">Q</span>
                  <div className="flex-1 text-sm font-medium">{task.question}</div>
                  <span className="text-xs text-slate-600">{new Date(task.ts).toLocaleTimeString()}</span>
                </div>
                {task.status === 'pending' || task.status === 'streaming' ? (
                  <div className="flex items-center gap-2 text-sm text-brand pl-7">
                    <Loader2 size={14} className="animate-spin" /> AI 思考中…
                  </div>
                ) : task.error ? (
                  <div className="text-sm text-rose-400 pl-7">{task.error}</div>
                ) : (
                  <div className="pl-7 space-y-2">
                    {task.answer && (
                      <div className="text-sm text-slate-200 whitespace-pre-wrap bg-brand/5 rounded-lg p-3 border border-brand/20">{task.answer}</div>
                    )}
                    {task.keyPoints && task.keyPoints.length > 0 && (
                      <div className="text-xs text-slate-400">
                        <div className="font-medium mb-1">要点：</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {task.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 面经分享弹窗 */}
      <ShareInterviewModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        qaList={shareQaList}
        defaultCompany={context.company}
        defaultPosition={context.position}
      />
    </div>
  );
}
