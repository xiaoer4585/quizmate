import { useState } from 'react';
import { Loader2, MessageSquare, Paperclip, X } from 'lucide-react';
import { api } from '../lib/ipc';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const readFile = (file: File) => new Promise<void>((resolve) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessage('附件不能超过 5MB');
      resolve();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name || '粘贴图片', type: file.type, data: String(reader.result || '') });
      setMessage('');
      resolve();
    };
    reader.onerror = () => { setMessage('附件读取失败，请重新粘贴'); resolve(); };
    reader.readAsDataURL(file);
  });

  const submit = async () => {
    if (!description.trim()) { setMessage('请先描述遇到的问题'); return; }
    setSending(true);
    setMessage('');
    try {
      await api.feedback.submit({
        description,
        attachmentName: attachment?.name,
        attachmentType: attachment?.type,
        attachmentData: attachment?.data,
      });
      setMessage('问题反馈已提交，感谢你的建议');
      setDescription('');
      setAttachment(null);
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      setMessage(/UNKNOWN_ACTION|未知操作/.test(raw)
        ? '当前服务尚未部署问题反馈接口，请联系管理员更新服务端'
        : (raw || '问题反馈提交失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 right-4 z-40 rounded-full bg-brand px-3 py-2 text-xs text-white shadow-lg hover:bg-brand/90">
      <MessageSquare size={14} className="inline mr-1" />问题反馈
    </button>
    {open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">问题反馈</h3>
            <button type="button" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          <textarea
            className="input min-h-28 w-full"
            placeholder="请描述遇到的问题或改进建议"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onPaste={async (event) => {
              const file = [...event.clipboardData.files][0];
              if (file) { event.preventDefault(); await readFile(file); }
            }}
          />
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <Paperclip size={13} />可直接粘贴截图/文件（最大 5MB）
            {attachment && <span className="text-emerald-400">已附：{attachment.name}</span>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{message}</span>
            <button className="btn-primary text-xs shrink-0" onClick={submit} disabled={sending}>
              {sending && <Loader2 size={13} className="inline animate-spin mr-1" />}提交问题反馈
            </button>
          </div>
        </div>
      </div>
    )}
  </>;
}
