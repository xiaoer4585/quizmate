import { ACTIVE_PROFILE_KEY, DEFAULT_SETTINGS, PROFILE_STORAGE_KEY, SETTINGS_KEY, createExampleProfileRecord } from './profile-schema.js';

const $ = (id) => document.getElementById(id);
let profiles = [];
let settings = { ...DEFAULT_SETTINGS };
let busy = false;

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '插件后台未响应');
  return response.data;
}

function toast(message, error = false) {
  const node = $('toast');
  node.textContent = message;
  node.className = `toast ${error ? 'error' : 'success'}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 3200);
}

async function load() {
  const stored = await chrome.storage.local.get([PROFILE_STORAGE_KEY, ACTIVE_PROFILE_KEY, SETTINGS_KEY]);
  profiles = Array.isArray(stored[PROFILE_STORAGE_KEY]) ? stored[PROFILE_STORAGE_KEY] : [];
  if (!profiles.length) {
    const example = createExampleProfileRecord();
    profiles = [example];
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profiles, [ACTIVE_PROFILE_KEY]: example.id });
  }
  settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  const activeId = stored[ACTIVE_PROFILE_KEY] || profiles[0]?.id || '';
  const select = $('profileSelect');
  select.innerHTML = profiles.length
    ? profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === activeId ? 'selected' : ''}>${escapeHtml(profile.name || '未命名简历')}</option>`).join('')
    : '<option value="">还没有简历</option>';
  select.disabled = !profiles.length;
  $('fillOnlyEmpty').checked = settings.fillOnlyEmpty !== false;
  $('profileHint').textContent = profiles.length
    ? `已保存 ${profiles.length} 份简历，当前资料只保存在本机浏览器。`
    : '请先打开“维护简历”创建或导入一份简历。';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function setBusy(value) {
  busy = value;
  $('scanButton').disabled = value;
  $('fillButton').disabled = value;
  $('profileSelect').disabled = value || !profiles.length;
}

function updateProgress({ phase, message, current, total, summary }) {
  const box = $('progress');
  box.classList.remove('hidden');
  $('progressText').textContent = message || ({ scanning: '识别页面…', planning: 'AI 规划…', filling: '填写并校验…', done: '填写完成' }[phase] || '处理中…');
  const numericCurrent = Number(current || 0);
  const numericTotal = Number(total || 0);
  $('progressCount').textContent = numericTotal ? `${numericCurrent}/${numericTotal}` : '';
  const phasePercent = { scanning: 18, planning: 42, filling: numericTotal ? 45 + Math.round(numericCurrent / numericTotal * 48) : 68, done: 100 }[phase] || 8;
  $('progressBar').style.width = `${Math.min(100, phasePercent)}%`;
  if (phase === 'done' && summary) showResult(summary);
}

function showResult(summary) {
  $('resultCard').classList.remove('hidden');
  $('resultNumber').textContent = String(summary.filled || 0);
  const notes = [];
  if (summary.unfilled) notes.push(`${summary.unfilled} 项需人工确认`);
  if (summary.aiFallback) notes.push('本轮使用了本地规则降级');
  if (summary.errors?.length) notes.push(`${summary.errors.length} 个页面区域未响应`);
  $('resultDetail').textContent = notes.join(' · ') || '全部已完成回读校验，请检查后自行提交。';
}

$('profileSelect').addEventListener('change', async (event) => {
  await chrome.storage.local.set({ [ACTIVE_PROFILE_KEY]: event.target.value });
  toast('已切换当前简历');
});

$('fillOnlyEmpty').addEventListener('change', async (event) => {
  settings.fillOnlyEmpty = event.target.checked;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
});

$('openResume').addEventListener('click', () => send({ type: 'QMAI_OPEN_RESUME' }).catch((error) => toast(error.message, true)));
$('closePanel').addEventListener('click', () => window.parent.postMessage({ type: 'OFFERFLOW_CLOSE_OVERLAY' }, '*'));

$('scanButton').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  $('fieldPreview').innerHTML = '';
  $('scanSummary').textContent = '正在扫描页面和嵌套表单…';
  try {
    const result = await send({ type: 'QMAI_SCAN_FORM' });
    $('scanSummary').innerHTML = `<strong>${result.total}</strong> 个字段 · ${escapeHtml((result.platforms || []).join(' / ') || '通用表单')}`;
    $('fieldPreview').innerHTML = (result.fields || []).slice(0, 12).map((field) => `<span title="${escapeHtml(field.type || '')}">${escapeHtml(field.label || field.key || '未命名字段')}</span>`).join('');
    if (!result.total) toast('没有识别到表单字段', true);
  } catch (error) {
    $('scanSummary').textContent = error.message;
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
});

$('fillButton').addEventListener('click', async () => {
  if (busy) return;
  if (!profiles.length) return toast('请先维护一份简历', true);
  setBusy(true);
  $('resultCard').classList.add('hidden');
  updateProgress({ phase: 'scanning', message: '准备识别页面…' });
  try {
    const summary = await send({ type: 'QMAI_START_FILL' });
    updateProgress({ phase: 'done', message: `完成：已填写 ${summary.filled || 0} 项`, summary });
  } catch (error) {
    toast(error.message, true);
    updateProgress({ phase: 'error', message: error.message });
  } finally {
    setBusy(false);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'QMAI_PROGRESS') updateProgress(message);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[PROFILE_STORAGE_KEY] || changes[ACTIVE_PROFILE_KEY])) load();
});

load().catch((error) => toast(error.message, true));
