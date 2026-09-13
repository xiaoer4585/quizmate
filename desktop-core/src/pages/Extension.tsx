import { BookOpen, Chrome, Download, ExternalLink, FileText } from 'lucide-react';
import { api } from '../lib/ipc';

export default function Extension() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Chrome size={22} className="text-indigo-400" /> QuizMate 求职浏览器插件
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          AI 网申自动填写 · 简历识别 · 永久免费
        </p>
      </div>

      <div className="card border-indigo-500/30 bg-indigo-500/5">
        <div className="text-sm font-medium text-indigo-300 mb-3">浏览器内的求职流程，由插件统一完成</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-900/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1"><FileText size={14} className="text-blue-400" /><span className="text-sm font-medium">AI 网申</span></div>
            <div className="text-xs text-slate-400">识别网申表单，结合个人资料与简历辅助填写</div>
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
        <button onClick={() => api.system.openExternal('https://www.quizmate.cn/download.html#ai-career-tools')} className="btn-primary text-xs">
          <Download size={14} /> 下载网申插件
        </button>
        <button onClick={() => api.system.openExternal('https://quizmate.cn/docs.html')} className="btn-outline text-xs">
          <BookOpen size={14} /> 查看安装文档
        </button>
        <button onClick={() => api.system.openExternal('https://quizmate.cn/download.html')} className="btn-outline text-xs">
          <ExternalLink size={14} /> 官网下载页
        </button>
      </div>
      <div className="text-xs text-slate-500 border-t border-slate-800 pt-4">
        Windows 客户端专注笔试和面试辅助；AI 网申插件专注简历识别与字段自动填写，永久免费使用，并和客户端共用 QuizMate 账号。
      </div>
    </div>
  );
}
