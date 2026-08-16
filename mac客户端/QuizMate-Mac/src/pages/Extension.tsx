import { BookOpen, CheckCircle2, Chrome, Download, ExternalLink, FileText, Radar } from 'lucide-react';
import { api } from '../lib/ipc';

const DOWNLOAD_URL = 'https://www.quizmate.vip/downloads/QuizMate-Career-Extension-2.2.0.zip';

export default function Extension() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Chrome size={22} className="text-indigo-400" /> QuizMate 求职浏览器插件
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          AI 网申 · 投递管理 · 职位监控 · <span className="text-emerald-400">永久免费</span>
        </p>
      </div>

      <div className="card border-indigo-500/30 bg-indigo-500/5">
        <div className="text-sm font-medium text-indigo-300 mb-3">浏览器内的求职流程，由插件统一完成</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-900/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1"><FileText size={14} className="text-blue-400" /><span className="text-sm font-medium">AI 网申</span></div>
            <div className="text-xs text-slate-400">识别网申表单，结合个人资料与简历辅助填写</div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={14} className="text-emerald-400" /><span className="text-sm font-medium">投递管理</span></div>
            <div className="text-xs text-slate-400">集中记录公司、岗位、进度和后续安排</div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1"><Radar size={14} className="text-cyan-400" /><span className="text-sm font-medium">职位监控</span></div>
            <div className="text-xs text-slate-400">关注目标岗位与校招信息，及时发现变化</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Download size={14} className="text-indigo-400" /> 安装步骤</h2>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal pl-4">
          <li>下载插件压缩包并解压到一个固定文件夹</li>
          <li>在 Chrome 或 Edge 地址栏打开 <code className="text-indigo-400 bg-slate-800 px-1 rounded">chrome://extensions</code></li>
          <li>打开页面右上角的「开发者模式」</li>
          <li>点击「加载已解压的扩展程序」，选择刚才解压的文件夹</li>
          <li>固定 QuizMate 图标，登录后即可使用</li>
        </ol>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => api.system.openExternal(DOWNLOAD_URL)} className="btn-primary text-xs">
          <Download size={14} /> 免费下载插件
        </button>
        <button onClick={() => api.system.openExternal('https://www.quizmate.vip/docs.html')} className="btn-outline text-xs">
          <BookOpen size={14} /> 查看安装文档
        </button>
        <button onClick={() => api.system.openExternal('https://www.quizmate.vip/download.html')} className="btn-outline text-xs">
          <ExternalLink size={14} /> 官网下载页
        </button>
      </div>

      <div className="text-xs text-slate-500 border-t border-slate-800 pt-4">
        Mac 客户端专注笔试和面试辅助；AI 网申、投递管理和职位监控由免费浏览器插件提供。
      </div>
    </div>
  );
}
