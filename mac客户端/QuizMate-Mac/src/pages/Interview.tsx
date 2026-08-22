// 面试助手 - 配置页（主窗口中）
// 功能：配置面试上下文、上传简历、启动悬浮窗、查看历史 QA 记录
// 语音识别通过主进程连接后台配置的实时语音模型
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, ShieldCheck, ShieldAlert, Trash2, Sparkles, FileText, CheckCircle2, Circle, Monitor, Share2, History, Send, Keyboard, Save, RefreshCw, Edit3, Plus, HelpCircle, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { api, useProfile } from '../lib/ipc';
import ShareInterviewModal from '../components/ShareInterviewModal';
import ShortcutSettings from '../components/ShortcutSettings';
import FeatureGuide, { type FeatureGuideStep } from '../components/FeatureGuide';
import { defaultShortcutBindings, interviewShortcutActions } from '../../shared/shortcuts';

interface HistoryTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: 'pending' | 'streaming' | 'done' | 'error' | 'skipped';
  ts: number;
}

interface InterviewResume {
  id: string;
  name: string;
  text: string;
  uploadedAt: string;
}

interface InterviewContextDraft {
  position: string;
  company: string;
  jobDescription: string;
  jobDescriptionHtml: string;
  answerStyle: 'concise' | 'detailed';
  audioMode: 'demo' | 'formal';
}

const emptyContext: InterviewContextDraft = {
  position: '', company: '', jobDescription: '', jobDescriptionHtml: '', answerStyle: 'concise', audioMode: 'demo',
};

function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI']);
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!allowed.has(element.tagName)) {
          const parent = element.parentNode;
          while (element.firstChild) parent?.insertBefore(element.firstChild, element);
          parent?.removeChild(element);
        } else {
          [...element.attributes].forEach((attr) => element.removeAttribute(attr.name));
          walk(element);
        }
      }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}

function richTextToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  return (doc.body.innerText || doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export default function Interview() {
  const { data: profile } = useProfile();
  const [listening, setListening] = useState(false);
  const [context, setContext] = useState<InterviewContextDraft>(emptyContext);
  const [contextEditing, setContextEditing] = useState(false);
  const [draftContext, setDraftContext] = useState<InterviewContextDraft>(emptyContext);
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
  const [resumeEditing, setResumeEditing] = useState(false);
  const [resumeName, setResumeName] = useState('我的简历');
  const [resumeDraft, setResumeDraft] = useState('');
  const [overlayActive, setOverlayActive] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shortcutBindings, setShortcutBindings] = useState<Record<string, string>>(defaultShortcutBindings);
  const [savingContext, setSavingContext] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [contextStatus, setContextStatus] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const systemApi = (window as any).api?.system;
  const [permissions, setPermissions] = useState<{ screen: string; microphone: string }>({ screen: 'unknown', microphone: 'unknown' });
  const jobDescriptionRef = useRef<HTMLDivElement | null>(null);

  const guideAccount = profile?.account?.email || profile?.email || 'current';
  const guideStorageKey = `quizmate.feature-guide.interview.${guideAccount}`;

  const refreshPermissions = async () => {
    try {
      const p = await systemApi?.getPermissions?.();
      const normalized = { screen: String(p?.screen || 'unknown'), microphone: String(p?.microphone || 'unknown') };
      setPermissions(normalized);
      return normalized;
    } catch {
      return permissions;
    }
  };

  useEffect(() => {
    refreshPermissions();
    if (!profile) return;
    const forced = window.location.hash.includes('guide=1');
    if (forced || window.localStorage.getItem(guideStorageKey) !== 'done') setGuideOpen(true);
  }, [guideStorageKey, profile]);

  useEffect(() => {
    const onFocus = () => { void refreshPermissions(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });

  useEffect(() => {
    const openGuide = (event: Event) => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      if (page === 'interview') setGuideOpen(true);
    };
    window.addEventListener('quizmate:open-feature-guide', openGuide);
    return () => window.removeEventListener('quizmate:open-feature-guide', openGuide);
  }, []);

  const openInterviewPermission = async (kind: 'screen' | 'microphone') => {
    if (kind === 'microphone') await systemApi?.requestMicrophone?.().catch(() => {});
    if (kind === 'screen') await systemApi?.requestScreen?.().catch(() => false);
    await systemApi?.openPermissionSettings?.(kind);
    setTimeout(() => { void refreshPermissions(); }, 1000);
  };

  const finishGuide = () => {
    window.localStorage.setItem(guideStorageKey, 'done');
    setGuideOpen(false);
  };

  const refreshResumes = async () => {
    const list = await api.interview.listResumes();
    setResumes(list as InterviewResume[] || []);
    const active = await api.interview.getActiveResume();
    const current = active as InterviewResume | undefined;
    setActiveResumeId(current?.id || null);
    if (current) {
      setResumeName(current.name);
      setResumeDraft(current.text);
    }
  };

  const refreshHistory = async () => {
    const tasks = await api.interview.getTasks();
    setHistoryTasks((tasks as HistoryTask[]) || []);
  };

  useEffect(() => {
    api.interview.activateShortcuts().catch(() => {});
    refreshResumes().catch(() => {});
    refreshHistory().catch(() => {});
    api.interview.isOverlayActive().then(setOverlayActive).catch(() => {});
    api.interview.getContext().then((saved: any) => {
      if (saved && typeof saved === 'object') {
        const next: InterviewContextDraft = {
          ...emptyContext,
          position: String(saved.position ?? ''),
          company: String(saved.company ?? ''),
          jobDescription: String(saved.jobDescription ?? ''),
          jobDescriptionHtml: sanitizeRichText(String(saved.jobDescriptionHtml ?? '')),
          answerStyle: saved.answerStyle === 'detailed' ? 'detailed' : 'concise',
          audioMode: saved.audioMode === 'formal' ? 'formal' : 'demo',
        };
        if (!next.jobDescriptionHtml && next.jobDescription) {
          next.jobDescriptionHtml = next.jobDescription.replace(/\n/g, '<br>');
        }
        setContext(next);
        setDraftContext(next);
      }
    }).catch(() => {});
    api.exam.getShortcutBindings().then(setShortcutBindings).catch(() => {});
    const offShortcuts = (window as any).electronAPI?.on('shortcuts:updated', (next: Record<string, string>) => setShortcutBindings(next));
    return () => { offShortcuts?.(); api.interview.deactivateShortcuts().catch(() => {}); };
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

  // 一个按钮统一控制面试悬浮窗和实时听写，快捷键走同一 IPC。
  const toggleInterviewSession = async () => {
    setError('');
    try {
      if (!listening) {
        const latest = await refreshPermissions();
        if (latest.microphone !== 'granted') {
          await openInterviewPermission('microphone');
          return;
        }
        if (latest.screen !== 'granted') {
          await openInterviewPermission('screen');
          return;
        }
      }
      const result = await api.interview.toggleSession(context);
      setListening(!!result?.listening);
      setOverlayActive(!!result?.overlay);
    } catch (e: any) {
      setError(e?.message || '启动面试失败');
      setListening(false);
      setOverlayActive(false);
    }
  };

  const startResumeEditing = () => {
    setResumeEditing(true);
    if (!activeResumeId) {
      setResumeName('我的简历');
      setResumeDraft('');
    }
  };

  const saveResume = async () => {
    setUploading(true);
    try {
      const text = resumeDraft.trim();
      if (!text) { setError('请先粘贴简历内容'); return; }
      const r = await api.interview.saveResume({ id: activeResumeId || undefined, name: resumeName, text });
      if ((r as any)?.error) setError((r as any).error);
      else {
        setResumeEditing(false);
        setContext((current) => ({ ...current, jobDescription: current.jobDescription }));
        await refreshResumes();
      }
    } catch (e: any) {
      setError(e?.message || '保存简历失败');
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
    const selected = id ? resumes.find((resume) => resume.id === id) : undefined;
    setResumeName(selected?.name || '我的简历');
    setResumeDraft(selected?.text || '');
    setResumeEditing(false);
  };

  const startNewResume = () => {
    setActiveResumeId(null);
    setResumeName('我的简历');
    setResumeDraft('');
    setResumeEditing(true);
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

  const saveInterviewContext = async () => {
    setSavingContext(true);
    setContextStatus('');
    try {
      const html = sanitizeRichText(draftContext.jobDescriptionHtml);
      const payload = {
        ...draftContext,
        jobDescriptionHtml: html,
        jobDescription: richTextToPlainText(html) || draftContext.jobDescription.trim(),
      };
      const saved = await api.interview.saveContext(payload);
      const next = { ...draftContext, ...payload, ...(saved as any) };
      setContext(next);
      setDraftContext(next);
      setContextEditing(false);
      setContextStatus('面试上下文已保存');
    } catch (e: any) {
      setContextStatus(e?.message || '保存面试上下文失败');
    } finally {
      setSavingContext(false);
    }
  };

  const changeAudioMode = async (audioMode: 'demo' | 'formal') => {
    if (audioMode === context.audioMode || switchingMode) return;
    const next = { ...context, audioMode };
    setContext(next);
    setDraftContext((current) => ({ ...current, audioMode }));
    setSwitchingMode(true);
    setContextStatus('正在切换采集模式…');
    try {
      const saved = await api.interview.saveContext(next);
      if (saved && typeof saved === 'object') {
        const savedContext = { ...next, ...(saved as any) };
        setContext(savedContext);
        setDraftContext((current) => ({ ...current, audioMode: savedContext.audioMode }));
      }
      if (listening) {
        await api.interview.restartListening(next);
        setListening(true);
      }
      setContextStatus(audioMode === 'formal' ? '已切换为正式面试模式' : '已切换为演示模式');
    } catch (e: any) {
      setContext((current) => ({ ...current, audioMode: context.audioMode }));
      setDraftContext((current) => ({ ...current, audioMode: context.audioMode }));
      setError(e?.message || '切换采集模式失败');
      setContextStatus('切换失败，请重试');
    } finally {
      setSwitchingMode(false);
    }
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
    pending: t.status === 'pending' || t.status === 'streaming',
    ts: t.ts,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {(permissions.microphone !== 'granted' || permissions.screen !== 'granted') && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} className="text-amber-400" /> 面试助手需要音频授权</div>
          <div className="mt-1 text-xs text-amber-100/80">演示模式会识别麦克风和扬声器；正式面试模式只把扬声器作为面试官问题输入。系统音频采集还需要屏幕录制权限。</div>
          <div className="mt-2 flex gap-2">
            {permissions.microphone !== 'granted' && <button onClick={() => openInterviewPermission('microphone')} className="btn-outline text-xs border-amber-500/50 text-amber-200">授权麦克风</button>}
            {permissions.screen !== 'granted' && <button onClick={() => openInterviewPermission('screen')} className="btn-outline text-xs border-amber-500/50 text-amber-200">授权扬声器/系统音频</button>}
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mic size={22} className="text-rose-400" /> 面试助手
          </h1>
          <p className="text-sm text-slate-400 mt-1">实时听写面试官问题 · AI 秒出参考答案 · 结合简历作答 · 窗口隐身防录屏</p>
        </div>
        <div className="flex items-center gap-2" data-guide-target="interview-overlay">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs">
            积分余额 <span className="text-amber-400 font-bold">{credits}</span>
            <span className="text-slate-500 ml-2">（每次 AI 作答消耗 20 积分）</span>
          </div>
          <button onClick={toggleInterviewSession} className={`btn-outline text-xs ${listening || overlayActive ? 'text-emerald-400 border-emerald-500/50' : ''}`} title="开始/结束面试：同时控制听写和悬浮窗">
            <Monitor size={14} /> {listening ? '结束面试' : '开始面试'}
          </button>
        </div>
      </div>

      {/* 上下文配置 */}
      <div className="card" data-guide-target="interview-context">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5"><Sparkles size={12} /> 面试上下文</div>
          {!contextEditing ? (
            <button type="button" onClick={() => { setDraftContext(context); setContextEditing(true); }} className="btn-outline text-xs" title="编辑面试上下文">
              <Edit3 size={13} /> 编辑
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setDraftContext(context); setContextEditing(false); }} className="btn-ghost text-xs">取消</button>
              <button type="button" onClick={saveInterviewContext} disabled={savingContext || switchingMode} className="btn-primary text-xs">
                {savingContext ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
              </button>
            </div>
          )}
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-medium text-slate-200">听写模式</div>
            <div className="text-[11px] text-slate-500 mt-0.5">切换时会重启采集，悬浮窗保持不变</div>
          </div>
          <div className="inline-flex rounded-md border border-slate-700 bg-slate-900 p-1" data-guide-target="interview-mode">
            <button type="button" disabled={switchingMode} onClick={() => changeAudioMode('demo')}
              className={`px-3 py-1.5 text-xs rounded ${context.audioMode === 'demo' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>
              {switchingMode && context.audioMode === 'demo' ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}演示模式
            </button>
            <button type="button" disabled={switchingMode} onClick={() => changeAudioMode('formal')}
              className={`px-3 py-1.5 text-xs rounded ${context.audioMode === 'formal' ? 'bg-emerald-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>
              {switchingMode && context.audioMode === 'formal' ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}正式面试模式
            </button>
          </div>
        </div>
        <div className={`mb-4 rounded-md px-3 py-2 text-xs font-medium ${context.audioMode === 'formal' ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          {context.audioMode === 'formal'
            ? '正式面试模式：只识别扬声器/系统音频，作为面试官问题输入；忽略麦克风中的面试者回答。'
            : '演示模式：同时识别麦克风和扬声器/系统音频，两路声音都会作为问题识别输入。'}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">应聘岗位</label>
            {contextEditing ? <input className="input" placeholder="如：Java 后端开发" value={draftContext.position}
              onChange={(e) => setDraftContext({ ...draftContext, position: e.target.value })} disabled={listening} /> : <div className="text-sm text-slate-200 py-2">{context.position || '未设置'}</div>}
          </div>
          <div>
            <label className="label">面试公司</label>
            {contextEditing ? <input className="input" placeholder="如：字节跳动" value={draftContext.company}
              onChange={(e) => setDraftContext({ ...draftContext, company: e.target.value })} disabled={listening} /> : <div className="text-sm text-slate-200 py-2">{context.company || '未设置'}</div>}
          </div>
          <div>
            <label className="label">答案风格</label>
            {contextEditing ? <select className="input" value={draftContext.answerStyle}
              onChange={(e) => setDraftContext({ ...draftContext, answerStyle: e.target.value as any })} disabled={listening}>
              <option value="concise">简洁回答</option><option value="detailed">详细展开</option>
            </select> : <div className="text-sm text-slate-200 py-2">{context.answerStyle === 'detailed' ? '详细展开' : '简洁回答'}</div>}
          </div>
        </div>
        <div className="mt-3">
          <label className="label">岗位描述</label>
          {contextEditing ? (
            <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-950/50">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800">
                <button type="button" className="btn-ghost p-1" title="加粗" onClick={() => document.execCommand('bold')}><Bold size={13} /></button>
                <button type="button" className="btn-ghost p-1" title="斜体" onClick={() => document.execCommand('italic')}><Italic size={13} /></button>
                <button type="button" className="btn-ghost p-1" title="项目符号" onClick={() => document.execCommand('insertUnorderedList')}><List size={13} /></button>
                <button type="button" className="btn-ghost p-1" title="编号列表" onClick={() => document.execCommand('insertOrderedList')}><ListOrdered size={13} /></button>
                <span className="text-[10px] text-slate-500 ml-2">支持直接粘贴并编辑 JD</span>
              </div>
              <div ref={jobDescriptionRef} contentEditable={!listening} suppressContentEditableWarning
                className="min-h-28 max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(draftContext.jobDescriptionHtml || draftContext.jobDescription.replace(/\n/g, '<br>')) }}
                onInput={(e) => {
                  const html = sanitizeRichText(e.currentTarget.innerHTML);
                  setDraftContext((current) => ({ ...current, jobDescriptionHtml: html, jobDescription: richTextToPlainText(html) }));
                }} />
            </div>
          ) : (
            <div className="min-h-16 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap border border-slate-800 rounded-lg px-3 py-2 bg-slate-950/30">{context.jobDescription || '未设置岗位描述'}</div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className={`px-2 py-1 rounded ${context.audioMode === 'demo' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            {context.audioMode === 'demo' ? '演示模式：识别麦克风 + 扬声器，作为问题输入' : '正式面试模式：只识别扬声器（面试官问题）'}
          </span>
          {contextStatus && <span className="text-slate-400">{contextStatus}</span>}
        </div>
      </div>

      {/* 简历管理 - 文本编辑与保存 */}
      <div className="card" data-guide-target="interview-resume">
        <div className="flex items-center justify-between mb-2 gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5"><FileText size={12} /> 简历内容</div>
          <div className="flex items-center gap-2">
            <button onClick={startNewResume} disabled={listening} className="btn-ghost text-xs" title="新建简历"><Plus size={13} /> 新建</button>
            {!resumeEditing ? (
              <button onClick={startResumeEditing} disabled={listening} className="btn-outline text-xs"><Edit3 size={13} /> 编辑</button>
            ) : (
              <button onClick={saveResume} disabled={uploading || listening} className="btn-primary text-xs">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存简历
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">直接复制粘贴简历文本，保存后作为 AI 回答的个人经历依据；内容仅保存在本机。</div>
        <div className="flex items-center gap-2 mb-2">
          <select className="input flex-1" value={activeResumeId || ''} onChange={(e) => onSetActive(e.target.value || null)} disabled={resumeEditing || listening}>
            <option value="">未选择简历</option>
            {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
          </select>
          {activeResumeId && <button onClick={() => onDelete(activeResumeId)} disabled={resumeEditing || listening} className="btn-ghost text-xs text-rose-400" title="删除当前简历"><Trash2 size={13} /></button>}
        </div>
        {resumeEditing ? (
          <div className="space-y-2">
            <input className="input" value={resumeName} onChange={(e) => setResumeName(e.target.value)} placeholder="简历名称" />
            <textarea className="input min-h-48 resize-y leading-relaxed" value={resumeDraft} onChange={(e) => setResumeDraft(e.target.value)} placeholder="请粘贴简历全文：教育经历、工作经历、项目、技能和成果…" />
          </div>
        ) : activeResumeId ? (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-300 border border-slate-800 rounded-lg px-3 py-2 bg-slate-950/30">{resumeDraft || '简历内容为空'}</div>
        ) : (
          <div className="text-xs text-slate-500 py-4 text-center bg-slate-900/30 rounded-lg">尚未保存简历，点击“编辑”或“新建”开始粘贴</div>
        )}
      </div>

      {/* 控制台 */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <button data-guide-target="interview-listen" onClick={toggleInterviewSession} className={listening ? 'btn-outline border-rose-500/50 text-rose-400' : 'btn bg-rose-500 hover:bg-rose-600 text-white'}>
            {listening ? <MicOff size={16} /> : <Mic size={16} />} {listening ? '结束面试' : '开始面试'}
          </button>
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

      <div data-guide-target="interview-shortcuts">
        <ShortcutSettings
          commonActions={interviewShortcutActions}
          bindings={shortcutBindings}
          onBindingsChange={setShortcutBindings}
          accentClass="bg-rose-500"
        />
      </div>

      {/* 隐身提示 */}
      <div className="card bg-emerald-500/5 border-emerald-500/20 flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-400" />
        <span className="text-xs text-emerald-300">隐身保护已启用：悬浮窗对屏幕共享、录屏软件、远程桌面不可见，可放心使用。</span>
      </div>

      {error && (
        <div className="card border-rose-500/30 bg-rose-500/5 text-sm text-rose-300">{error}</div>
      )}

      {/* 历史 QA 记录 */}
      <div className="card" data-guide-target="interview-results">
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
                ) : task.status === 'skipped' ? (
                  <div className="text-sm text-slate-500 pl-7">已识别为求职者回答，跳过 AI 生成</div>
                ) : task.error ? (
                  <div className="text-sm text-rose-400 pl-7">{task.error}</div>
                ) : (
                  <div className="pl-7 space-y-2">
                    {task.answer && (
                      <div className="text-sm text-slate-200 whitespace-pre-wrap bg-brand/5 rounded-lg p-3 border border-brand/20">{task.answer}</div>
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
      <FeatureGuide
        open={guideOpen}
        title="面试助手操作指引"
        steps={[
          { title: '选择听写模式', description: '演示模式同时识别麦克风和扬声器，适合自己演练；正式面试模式只识别扬声器，也就是只把面试官的声音作为问题输入。', target: '[data-guide-target="interview-mode"]' },
          { title: '编辑并保存面试上下文', description: '点击编辑，填写应聘岗位、面试公司、答案风格和岗位描述，然后点击保存。AI 会结合这些信息生成回答。', target: '[data-guide-target="interview-context"]' },
          { title: '粘贴并保存简历', description: '点击新建或编辑，直接粘贴简历文本并保存。自我介绍和项目问题会优先使用简历中的真实经历。', target: '[data-guide-target="interview-resume"]' },
          { title: '启动参考答案悬浮窗', description: '点击“启动悬浮窗”，问题流显示在左侧，当前有效问题的参考答案显示在右侧。', target: '[data-guide-target="interview-overlay"]' },
          { title: '开始面试', description: `点击“开始面试”，或按 ${shortcutBindings.interview_start || '开始/结束面试快捷键'}。它会同时打开参考答案悬浮窗并启动听写；再次点击或按快捷键即可同时结束。`, target: '[data-guide-target="interview-listen"]' },
          { title: '切换问题和查看答案', description: `使用 ${shortcutBindings.interview_prev_question || '上一题快捷键'} 和 ${shortcutBindings.interview_next_question || '下一题快捷键'} 在问题流中切换；右侧始终显示当前选中问题的参考答案。`, target: '[data-guide-target="interview-results"]' },
        ] as FeatureGuideStep[]}
        onClose={finishGuide}
        onComplete={finishGuide}
      />
    </div>
  );
}
