import { isAuthenticated, login, register, logout, getCachedUser } from '../lib/auth.js';
import { postAction } from '../lib/api.js';
import { ACTION, WEB_BASE_URL } from '../lib/constants.js';

const GROUPS = [
  { title: '基本信息', fields: ['姓名', '英文名', '性别', '出生年月', '籍贯', '现居住地', '户口所在地', '户口性质', '政治面貌', '民族', '身份证号', '婚姻状况', '健康状况', '身高', '体重', '是否应届生'] },
  { title: '联系方式', fields: ['手机号', '邮箱', '微信号', '通讯地址', '邮政编码', '紧急联系人', '紧急联系电话', '个人主页', 'GitHub', 'LinkedIn'] },
  { title: '教育背景', fields: ['毕业院校', '学校所在城市', '院系', '专业', '专业类别', '学历', '学位', '学制', '入学时间', '毕业时间', 'GPA', 'GPA满分', '年级排名', '专业人数', '培养方式', '主修课程'] },
  { title: '能力与经历', fields: ['英语等级', '英语分数', '其他语言', '技能证书', '实习经历', '工作经历', '项目经历', '校园经历', '获奖情况', '论文专利', '作品链接', '家庭成员'] },
  { title: '求职信息', fields: ['意向岗位', '意向行业', '职位类别', '工作性质', '意向城市', '期望薪资', '到岗时间', '可实习时长', '每周到岗天数', '是否接受调剂', '是否服从分配', '是否有亲属任职', '自我评价', '个人优势', '兴趣爱好'] }
];
const LONG_FIELDS = new Set(['主修课程', '技能证书', '实习经历', '工作经历', '项目经历', '校园经历', '获奖情况', '论文专利', '家庭成员', '自我评价', '个人优势', '兴趣爱好']);
const state = { view: 'fill', profiles: [], selectedProfileId: null, autoFillEnabled: false, editing: null, authed: false, user: null, authMode: 'login', applications: [], jobs: [], jobsKeyword: '', monitor: { enabled: false, intervalMinutes: 360, lastRun: null } };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function id() { return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`; }
function activeProfile() { return state.profiles.find(profile => profile.id === state.selectedProfileId) || state.profiles[0] || null; }
function send(message) { return chrome.runtime.sendMessage(message); }

async function load() {
  state.authed = await isAuthenticated();
  state.user = state.authed ? await getCachedUser() : null;
  const stored = await chrome.storage.local.get(['profiles', 'selectedProfileId', 'autoFillEnabled']);
  state.profiles = Array.isArray(stored.profiles) ? stored.profiles : [];
  state.selectedProfileId = state.profiles.some(profile => profile.id === stored.selectedProfileId) ? stored.selectedProfileId : state.profiles[0]?.id || null;
  state.autoFillEnabled = Boolean(stored.autoFillEnabled);
  if (state.authed) {
    const applications = await send({ action: 'listApplications' }).catch(() => ({ applications: [] }));
    state.applications = applications.applications || [];
    const monitor = await chrome.storage.local.get(['monitorEnabled', 'monitorInterval', 'lastMonitorRun', 'cachedJobs']);
    state.monitor = { enabled: Boolean(monitor.monitorEnabled), intervalMinutes: monitor.monitorInterval || 360, lastRun: monitor.lastMonitorRun || null };
    state.jobs = Array.isArray(monitor.cachedJobs) ? monitor.cachedJobs : [];
  }
  await persist();
  render();
}
async function persist() {
  await chrome.storage.local.set({ profiles: state.profiles, selectedProfileId: state.selectedProfileId, autoFillEnabled: state.autoFillEnabled });
}

function toast(message, error = false) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.className = error ? 'error' : '';
  element.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.style.display = 'none'; }, 4200);
}

function render() {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === state.view));
  const app = document.getElementById('app');
  if (!state.authed) app.innerHTML = renderAuth();
  else if (state.editing) app.innerHTML = renderEditor();
  else if (state.view === 'fill') app.innerHTML = renderFill();
  else if (state.view === 'profiles') app.innerHTML = renderProfiles();
  else if (state.view === 'progress') app.innerHTML = renderProgress();
  else if (state.view === 'jobs') app.innerHTML = renderJobs();
  else app.innerHTML = renderMore();
  bind();
}

function renderAuth() {
  return `<section class="panel"><h2 class="panel-title">${state.authMode === 'login' ? '登录 QuizMate' : '注册 QuizMate'}</h2><p class="muted">登录后同步档案、使用 AI 识别和职位监控。</p>
    <div class="field"><label for="auth-email">邮箱</label><input id="auth-email" type="email" autocomplete="email"></div>
    <div class="field"><label for="auth-password">密码</label><input id="auth-password" type="password" autocomplete="current-password"></div>
    ${state.authMode === 'register' ? '<div class="field"><label for="auth-invite">邀请码（选填）</label><input id="auth-invite"></div>' : ''}
    <button class="command primary" id="auth-submit" style="width:100%">${state.authMode === 'login' ? '登录' : '注册'}</button>
    <button class="command" id="auth-switch" style="width:100%;margin-top:8px">${state.authMode === 'login' ? '没有账号，去注册' : '已有账号，去登录'}</button></section>`;
}

function renderFill() {
  const options = state.profiles.map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === state.selectedProfileId ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('');
  return `<section class="panel"><h2 class="panel-title">当前填写档案</h2>
    ${options ? `<select id="profile-select">${options}</select>` : '<div class="empty">还没有档案，请先在“档案”页创建</div>'}
    <div class="switch"><label for="auto-fill">进入网申页面后自动填写<br><span class="muted">动态加载的表单也会继续填写，不会提交</span></label><input id="auto-fill" type="checkbox" ${state.autoFillEnabled ? 'checked' : ''} ${options ? '' : 'disabled'}></div>
  </section>
  <section class="panel"><h2 class="panel-title">当前页面</h2><p class="muted">快速填写保留已有内容；覆盖填写会替换页面中已输入的值。</p>
    <div class="actions"><button class="command" id="detect">检测字段</button><button class="command primary" id="fill">快速填写</button></div>
    <button class="command" id="overwrite" style="width:100%;margin-top:8px">覆盖填写</button>
  </section>`;
}

function renderProfiles() {
  const rows = state.profiles.map(profile => `<div class="profile"><div><strong>${escapeHtml(profile.name)}</strong><small>${Object.keys(profile.fields || {}).filter(key => profile.fields[key]).length} 项资料</small></div><div class="profile-buttons"><button class="command" data-edit="${escapeHtml(profile.id)}">编辑</button><button class="command danger" data-delete="${escapeHtml(profile.id)}">删除</button></div></div>`).join('');
  return `<section class="panel"><h2 class="panel-title">我的档案</h2>${rows || '<div class="empty">创建档案后即可自动填写网申</div>'}<button class="command primary" id="new-profile" style="width:100%;margin-top:10px">新建档案</button></section>`;
}

function renderEditor() {
  const profile = state.editing;
  const groups = GROUPS.map(group => `<div class="section-label">${group.title}</div><div class="grid">${group.fields.map(field => {
    const value = escapeHtml(profile.fields[field] || '');
    return `<div class="${LONG_FIELDS.has(field) ? 'wide' : ''}"><label for="field-${field}">${field}</label>${LONG_FIELDS.has(field) ? `<textarea id="field-${field}">${value}</textarea>` : `<input id="field-${field}" value="${value}">`}</div>`;
  }).join('')}</div>`).join('');
  return `<section class="panel editor"><h2 class="panel-title">编辑档案</h2><div class="field"><label for="profile-name">档案名称</label><input id="profile-name" value="${escapeHtml(profile.name)}"></div>
    <div class="field"><label for="source">粘贴资料后自动提取</label><textarea id="source" placeholder="例如：姓名：张三&#10;手机号：13800138000&#10;毕业院校：测试大学"></textarea><label class="file-picker" for="source-file">上传图片、PDF、Word、TXT、Markdown 或 JSON</label><input id="source-file" type="file" accept="image/*,.pdf,.doc,.docx,.txt,.md,.json"><button class="command" id="parse" style="width:100%;margin-top:7px">识别并填入</button></div>
    ${groups}<div class="actions"><button class="command" id="cancel">取消</button><button class="command primary" id="save">保存档案</button></div></section>`;
}

function parseText(text) {
  const result = {};
  for (const { fields } of GROUPS) for (const field of fields) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${field}\\s*[:：]\\s*([^\\n]+)`, 'i'));
    if (match) result[field] = match[1].trim();
  }
  const fallbacks = {
    '手机号': /1[3-9]\d{9}/, '邮箱': /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    '身份证号': /\d{17}[\dXx]/, 'GPA': /GPA\s*[:：]?\s*([0-9.]+)/i
  };
  for (const [key, pattern] of Object.entries(fallbacks)) {
    const match = text.match(pattern);
    if (match && !result[key]) result[key] = match[1] || match[0];
  }
  if (!result['姓名']) result['姓名'] = text.split(/\r?\n/).map(line => line.trim()).find(line => /^[\u4e00-\u9fa5]{2,4}$/.test(line)) || '';
  if (!result['毕业院校']) result['毕业院校'] = text.split(/\r?\n/).map(line => line.trim()).find(line => /(?:大学|学院|university|college)/i.test(line) && line.length < 60) || '';
  if (!result['学历']) result['学历'] = (text.match(/博士研究生|硕士研究生|本科|大专|博士|硕士/) || [])[0] || '';
  if (!result['英语等级']) result['英语等级'] = (text.match(/大学英语[四六]级|CET[- ]?[46]|雅思\s*\d+(?:\.\d+)?|托福\s*\d+/i) || [])[0] || '';
  return result;
}

async function extractPdfText(file) {
  const pdfjs = await import('../lib/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n');
}

async function extractDocxText(file) {
  if (!globalThis.mammoth) throw new Error('Word 解析组件加载失败');
  const result = await globalThis.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || '';
}

const STATUS_LABELS = { submitted: '已投递', written_test: '笔试', interview: '面试中', offer: '已 Offer', rejected: '未通过' };
function renderProgress() {
  const counts = Object.keys(STATUS_LABELS).map(status => `<span class="status-chip">${STATUS_LABELS[status]} ${state.applications.filter(item => item.status === status).length}</span>`).join('');
  const statusOptions = current => Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
  const rows = state.applications.map(item => `<div class="profile app-row"><div><strong>${escapeHtml(item.company || '未命名公司')} · ${escapeHtml(item.position || '未命名职位')}</strong><small>${item.lastChecked ? `检查于 ${new Date(item.lastChecked).toLocaleString()}` : '尚未自动检查'}</small><select data-app-status="${escapeHtml(item.id)}">${statusOptions(item.status)}</select></div><div class="profile-buttons"><button class="command danger" data-app-delete="${escapeHtml(item.id)}">删除</button></div></div>`).join('');
  return `<section class="panel"><h2 class="panel-title">投递进度</h2><div class="status-row">${counts}</div><div class="row"><input id="app-company" placeholder="公司"><input id="app-position" placeholder="岗位"></div><button class="command primary" id="app-add" style="width:100%;margin-top:8px">跟踪当前网申页面</button>${rows || '<div class="empty">还没有投递记录</div>'}<button class="command" id="monitor-now" style="width:100%;margin-top:10px">立即检查状态与新职位</button><div class="switch"><label>定时投递与职位监控<br><span class="muted">每 ${state.monitor.intervalMinutes} 分钟检查一次</span></label><input id="monitor-toggle" type="checkbox" ${state.monitor.enabled ? 'checked' : ''}></div></section>`;
}
function renderJobs() {
  const jobs = state.jobs.filter(job => !state.jobsKeyword || `${job.company || ''} ${job.position || job.title || ''} ${job.city || ''}`.toLowerCase().includes(state.jobsKeyword.toLowerCase()));
  const rows = jobs.map(job => `<div class="profile"><div><strong>${escapeHtml(job.company || '未知公司')} · ${escapeHtml(job.position || job.title || '未知职位')}</strong><small>${escapeHtml(job.city || job.location || '')} ${escapeHtml(job.deadline || '')}</small></div><div class="profile-buttons"><button class="command" data-job-add="${state.jobs.indexOf(job)}">跟踪</button></div></div>`).join('');
  return `<section class="panel"><h2 class="panel-title">校招职位与公告</h2><div class="row"><input id="jobs-keyword" placeholder="搜索公司、岗位或城市" value="${escapeHtml(state.jobsKeyword)}"><button class="command" id="jobs-refresh">刷新</button></div><div style="margin-top:10px">${rows || '<div class="empty">点击刷新获取最新职位</div>'}</div></section>`;
}
function renderMore() {
  return `<section class="panel"><h2 class="panel-title">${escapeHtml(state.user?.email || '当前账号')}</h2><p class="muted">注册登录、档案和投递数据保存在当前扩展账号下。</p><button class="command primary" id="download-client" style="width:100%;margin-top:10px">下载桌面版 QuizMate</button><button class="command" id="open-web" style="width:100%;margin-top:8px">打开 QuizMate 官网</button><button class="command danger" id="logout" style="width:100%;margin-top:8px">退出登录</button></section>`;
}

function bind() {
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => { if (!state.authed) return; state.view = tab.dataset.view; state.editing = null; render(); });
  document.getElementById('auth-switch')?.addEventListener('click', () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; render(); });
  document.getElementById('auth-submit')?.addEventListener('click', submitAuth);
  document.getElementById('profile-select')?.addEventListener('change', async event => { state.selectedProfileId = event.target.value; await persist(); });
  document.getElementById('auto-fill')?.addEventListener('change', async event => { state.autoFillEnabled = event.target.checked; await persist(); toast(state.autoFillEnabled ? '已开启自动填写' : '已关闭自动填写'); });
  document.getElementById('detect')?.addEventListener('click', async () => {
    const result = await send({ action: 'detectForms' }).catch(error => ({ error: error.message }));
    toast(result.error || `检测到 ${result.count || 0} 个可填写字段`, Boolean(result.error));
  });
  document.getElementById('fill')?.addEventListener('click', () => fill(false));
  document.getElementById('overwrite')?.addEventListener('click', () => fill(true));
  document.getElementById('new-profile')?.addEventListener('click', () => { state.editing = { id: '', name: '我的档案', fields: {} }; render(); });
  document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => { const profile = state.profiles.find(item => item.id === button.dataset.edit); state.editing = structuredClone(profile); render(); });
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { state.profiles = state.profiles.filter(item => item.id !== button.dataset.delete); state.selectedProfileId = state.profiles[0]?.id || null; await persist(); render(); });
  document.getElementById('parse')?.addEventListener('click', async () => {
    try {
      let text = document.getElementById('source').value.trim();
      const file = document.getElementById('source-file').files[0];
      if (!text && !file) return toast('请粘贴资料或选择文件', true);
      if (file?.size > 10 * 1024 * 1024) return toast('文件不能超过 10MB', true);
      if (file && /\.(txt|md|json)$/i.test(file.name)) text += `\n${await file.text()}`;
      else if (file && /\.pdf$/i.test(file.name)) text += `\n${await extractPdfText(file)}`;
      else if (file && /\.docx$/i.test(file.name)) text += `\n${await extractDocxText(file)}`;
      if (text) document.getElementById('source').value = text.trim();
      let fields = parseText(text);
      if (file && /(?:^image\/|\.doc$)/i.test(`${file.type} ${file.name}`)) {
        const fileData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        const result = await send({ action: 'parseProfile', payload: { text: text || undefined, fileName: file.name, fileData, fieldNames: GROUPS.flatMap(group => group.fields) } }).catch(error => ({ error: error.message }));
        if (result.error || result.success === false) return toast(result.error || 'AI 资料识别失败', true);
        fields = { ...fields, ...(result.fields || {}) };
      }
      fields = Object.fromEntries(Object.entries(fields).filter(([, value]) => String(value || '').trim()));
      for (const [key, value] of Object.entries(fields)) { const input = document.getElementById(`field-${key}`); if (input) input.value = value; }
      toast(Object.keys(fields).length ? `已提取 ${Object.keys(fields).length} 项，请核对后保存` : '已读取文件，但没有识别到明确的档案字段', !Object.keys(fields).length);
    } catch (error) { toast(`资料解析失败：${error.message || '未知错误'}`, true); }
  });
  document.getElementById('cancel')?.addEventListener('click', () => { state.editing = null; render(); });
  document.getElementById('save')?.addEventListener('click', saveProfile);
  document.getElementById('monitor-now')?.addEventListener('click', async () => { const result = await send({ action: 'runMonitor' }).catch(error => ({ error: error.message })); if (result.error) toast(result.error, true); else { state.applications = (await send({ action: 'listApplications' })).applications || state.applications; const cached = await chrome.storage.local.get('cachedJobs'); state.jobs = cached.cachedJobs || state.jobs; toast(`检查 ${result.checked || 0} 条投递，更新 ${result.changes || 0} 条，新增职位 ${result.newJobs || 0} 个`); render(); } });
  document.getElementById('monitor-toggle')?.addEventListener('change', async event => { const result = await send({ action: 'setMonitor', enabled: event.target.checked, intervalMinutes: state.monitor.intervalMinutes }); if (result.error) toast(result.error, true); else { state.monitor.enabled = event.target.checked; toast(event.target.checked ? '已开启定时监控' : '已关闭定时监控'); } });
  document.querySelectorAll('[data-app-delete]').forEach(button => button.onclick = async () => { await send({ action: 'deleteApplication', id: button.dataset.appDelete }); state.applications = state.applications.filter(item => item.id !== button.dataset.appDelete); render(); });
  document.querySelectorAll('[data-app-status]').forEach(select => select.onchange = async () => { const existing = state.applications.find(item => item.id === select.dataset.appStatus); if (!existing) return; const oldStatus = existing.status; existing.status = select.value; if (oldStatus !== select.value) existing.history = [...(existing.history || []), { status: select.value, time: new Date().toISOString(), note: '手动更新' }]; await send({ action: 'saveApplication', application: existing }); render(); });
  document.getElementById('app-add')?.addEventListener('click', async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); const company = document.getElementById('app-company').value.trim(); const position = document.getElementById('app-position').value.trim(); if (!company || !position) return toast('请填写公司和岗位', true); const result = await send({ action: 'saveApplication', application: { company, position, url: tab?.url || '', status: 'submitted' } }); if (result.error) toast(result.error, true); else { state.applications.unshift(result.application); toast('已加入投递跟踪'); render(); } });
  document.getElementById('jobs-keyword')?.addEventListener('input', event => { state.jobsKeyword = event.target.value; });
  document.getElementById('jobs-refresh')?.addEventListener('click', async () => { const result = await send({ action: 'fetchJobs' }).catch(error => ({ error: error.message })); if (result.error) toast(result.error, true); else { state.jobs = result.jobs || []; render(); } });
  document.querySelectorAll('[data-job-add]').forEach(button => button.onclick = async () => { const job = state.jobs[Number(button.dataset.jobAdd)]; if (!job) return; const application = await send({ action: 'saveApplication', application: { company: job.company, position: job.position || job.title, url: job.url, status: 'submitted' } }); if (application.error) toast(application.error, true); else { state.applications.unshift(application.application); toast('已加入投递跟踪'); } });
  document.getElementById('download-client')?.addEventListener('click', async () => { const result = await send({ action: 'downloadClient' }); if (result?.error) toast(result.error, true); });
  document.getElementById('open-web')?.addEventListener('click', () => chrome.tabs.create({ url: WEB_BASE_URL }));
  document.getElementById('logout')?.addEventListener('click', submitLogout);
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return toast('请填写邮箱和密码', true);
  try {
    if (state.authMode === 'login') await login(email, password);
    else {
      const result = await register(email, password, document.getElementById('auth-invite')?.value.trim());
      if (!result.token) { state.authMode = 'login'; render(); toast('注册成功，请登录'); return; }
    }
    state.authed = true; state.user = await getCachedUser(); toast('登录成功'); await load();
  } catch (error) { toast(error.message || '认证失败', true); }
}
async function submitLogout() { await logout(); state.authed = false; state.user = null; state.authMode = 'login'; render(); }

async function fill(overwrite) {
  const profile = activeProfile();
  if (!profile) return toast('请先创建档案', true);
  const result = await send({ action: 'fillProfile', profileFields: profile.fields, overwrite }).catch(error => ({ error: error.message }));
  if (result.error || result.success === false) toast(result.error || '填写失败', true);
  else toast(`检测 ${result.detected} 项，匹配 ${result.matched} 项，本次填写 ${result.filled} 项`);
}

async function saveProfile() {
  const profile = state.editing;
  profile.name = document.getElementById('profile-name').value.trim() || '未命名档案';
  profile.fields = {};
  for (const { fields } of GROUPS) for (const field of fields) {
    const value = document.getElementById(`field-${field}`)?.value.trim();
    if (value) profile.fields[field] = value;
  }
  if (!profile.id) profile.id = id();
  profile.updatedAt = new Date().toISOString();
  const index = state.profiles.findIndex(item => item.id === profile.id);
  if (index >= 0) state.profiles[index] = profile; else state.profiles.push(profile);
  state.selectedProfileId = profile.id;
  state.editing = null;
  await persist();
  toast('档案已保存');
  render();
}

load().catch(error => toast(error.message, true));
