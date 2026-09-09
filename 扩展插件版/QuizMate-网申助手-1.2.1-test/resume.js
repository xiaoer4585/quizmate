import {
  ACTIVE_PROFILE_KEY,
  ARRAY_SECTIONS,
  DEFAULT_SETTINGS,
  GROUP_FIELDS,
  PROFILE_STORAGE_KEY,
  SETTINGS_KEY,
  createExampleProfileRecord,
  createProfileRecord,
  normalizeProfile
} from './profile-schema.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
let profiles = [];
let activeId = '';
let settings = { ...DEFAULT_SETTINGS };
let saveTimer;

const current = () => profiles.find((item) => item.id === activeId) || profiles[0];

function toast(message, error = false) {
  const node = $('toast');
  node.textContent = message;
  node.className = `toast ${error ? 'error' : 'success'}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 3600);
}

async function load() {
  const stored = await chrome.storage.local.get([PROFILE_STORAGE_KEY, ACTIVE_PROFILE_KEY, SETTINGS_KEY]);
  profiles = Array.isArray(stored[PROFILE_STORAGE_KEY]) ? stored[PROFILE_STORAGE_KEY] : [];
  if (!profiles.length) profiles = [createExampleProfileRecord()];
  profiles = profiles.map((item) => ({ ...item, profile: normalizeProfile(item.profile) }));
  activeId = profiles.some((item) => item.id === stored[ACTIVE_PROFILE_KEY]) ? stored[ACTIVE_PROFILE_KEY] : profiles[0].id;
  settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  await persist();
  render();
}

async function persist() {
  const record = current();
  if (record) record.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({
    [PROFILE_STORAGE_KEY]: profiles,
    [ACTIVE_PROFILE_KEY]: activeId,
    [SETTINGS_KEY]: settings
  });
  $('saveStatus')?.classList.add('saved');
  if ($('saveStatus')) $('saveStatus').textContent = '已保存';
}

function scheduleSave() {
  if ($('saveStatus')) {
    $('saveStatus').classList.remove('saved');
    $('saveStatus').textContent = '保存中…';
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch((error) => toast(error.message, true)), 280);
}

function inputField(path, key, label, kind, value) {
  const wide = kind === 'textarea' ? ' span-3' : '';
  const control = kind === 'textarea'
    ? `<textarea data-path="${escapeHtml(path)}" placeholder="${escapeHtml(label)}">${escapeHtml(value)}</textarea>`
    : `<input data-path="${escapeHtml(path)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(label)}" autocomplete="off">`;
  return `<div class="field${wide}"><label>${escapeHtml(label)}</label>${control}</div>`;
}

function groupCard(group, title) {
  const record = current();
  const fields = GROUP_FIELDS[group];
  return `<section class="editor-card"><header><h2>${title}</h2></header><div class="grid">${fields.map(([key, label, kind]) => inputField(`${group}.${key}`, key, label, kind, record.profile[group][key])).join('')}</div></section>`;
}

function arrayCard(section, config) {
  const rows = current().profile[section] || [];
  const content = rows.length ? rows.map((row, index) => `
    <div class="array-row">
      <div class="row-title">${escapeHtml(config.label)} ${index + 1}</div>
      <button class="remove-row" data-remove-section="${section}" data-index="${index}">删除</button>
      <div class="grid">${config.fields.map(([key, label, kind]) => inputField(`${section}.${index}.${key}`, key, label, kind, row[key])).join('')}</div>
    </div>`).join('') : `<div class="empty-section">暂无${escapeHtml(config.label)}，需要时点击右上角添加</div>`;
  return `<section class="editor-card"><header><h2>${escapeHtml(config.label)}</h2><button class="button secondary small" data-add-section="${section}">＋ 添加一段</button></header>${content}</section>`;
}

function customFieldsCard() {
  const rows = current().profile.customFields || [];
  const content = rows.length ? rows.map((row, index) => `
    <div class="array-row">
      <div class="row-title">自定义字段 ${index + 1}</div>
      <button class="remove-row" data-remove-section="customFields" data-index="${index}">删除</button>
      <div class="grid">
        ${inputField(`customFields.${index}.label`, 'label', '字段名称', '', row.label)}
        ${inputField(`customFields.${index}.value`, 'value', '字段值', 'textarea', row.value)}
      </div>
    </div>`).join('') : '<div class="empty-section">可添加招聘网站常问、但标准简历中没有的答案</div>';
  return `<section class="editor-card"><header><h2>自定义问答</h2><button class="button secondary small" data-add-section="customFields">＋ 添加字段</button></header>${content}</section>`;
}

function render() {
  const record = current();
  $('profileList').innerHTML = profiles.map((item) => `<button class="profile-item ${item.id === activeId ? 'active' : ''}" data-profile-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.name || '未命名简历')}</span><small>${item.id === activeId ? '当前' : ''}</small></button>`).join('');
  $('editor').innerHTML = `
    <section class="editor-card">
      <header><h2>简历名称</h2><button id="deleteProfile" class="button danger small" ${profiles.length <= 1 ? 'disabled' : ''}>删除此简历</button></header>
      <div class="grid"><div class="field span-2"><label>名称</label><input data-record-name value="${escapeHtml(record.name || '')}" placeholder="例如：产品经理主简历"></div><div class="field"><label>原文件</label><input value="${escapeHtml(record.sourceFileName || '未导入文件')}" disabled></div></div>
    </section>
    ${groupCard('basic', '基本信息')}
    ${groupCard('intention', '求职意向')}
    ${Object.entries(ARRAY_SECTIONS).map(([section, config]) => arrayCard(section, config)).join('')}
    ${groupCard('skills', '技能与证书')}
    ${groupCard('evaluation', '自我介绍与动机')}
    ${customFieldsCard()}`;
}

function setAtPath(source, path, value) {
  const parts = path.split('.');
  let cursor = source;
  for (let index = 0; index < parts.length - 1; index += 1) cursor = cursor[parts[index]];
  cursor[parts.at(-1)] = value;
}

function emptyArrayRow(section) {
  if (section === 'customFields') return { label: '', value: '' };
  return Object.fromEntries(ARRAY_SECTIONS[section].fields.map(([key]) => [key, '']));
}

$('profileList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-profile-id]');
  if (!button) return;
  activeId = button.dataset.profileId;
  persist().then(render);
});

$('addProfile').addEventListener('click', async () => {
  const record = createProfileRecord(`我的简历 ${profiles.length + 1}`);
  profiles.push(record);
  activeId = record.id;
  await persist();
  render();
});

$('editor').addEventListener('input', (event) => {
  if (event.target.matches('[data-record-name]')) current().name = event.target.value;
  else if (event.target.dataset.path) setAtPath(current().profile, event.target.dataset.path, event.target.value);
  scheduleSave();
});

$('editor').addEventListener('click', async (event) => {
  const add = event.target.closest('[data-add-section]');
  if (add) {
    current().profile[add.dataset.addSection].push(emptyArrayRow(add.dataset.addSection));
    await persist();
    render();
    return;
  }
  const remove = event.target.closest('[data-remove-section]');
  if (remove) {
    current().profile[remove.dataset.removeSection].splice(Number(remove.dataset.index), 1);
    await persist();
    render();
    return;
  }
  if (event.target.id === 'deleteProfile' && profiles.length > 1) {
    profiles = profiles.filter((item) => item.id !== activeId);
    activeId = profiles[0].id;
    await persist();
    render();
  }
});

/* AI model configuration is managed by the QuizMate backend. */
if ($('testConnection')) $('testConnection').addEventListener('click', async () => {
  await persist();
  $('connectionHint').textContent = '正在连接…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'QMAI_TEST_CONNECTION' });
    if (!response?.ok) throw new Error(response?.error || '连接失败');
    $('connectionHint').textContent = `连接成功 · ${response.data?.mode || 'AI 已就绪'}`;
    toast('AI 服务连接成功');
  } catch (error) {
    $('connectionHint').textContent = error.message;
    toast(error.message, true);
  }
});

$('parseFile').addEventListener('click', () => $('resumeFile').click());
$('importJson').addEventListener('click', () => $('jsonFile').click());

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

function mergeParsed(existing, parsed) {
  const next = normalizeProfile(existing);
  const incoming = normalizeProfile(parsed);
  for (const group of Object.keys(GROUP_FIELDS)) {
    for (const [key] of GROUP_FIELDS[group]) if (incoming[group][key]) next[group][key] = incoming[group][key];
  }
  for (const section of Object.keys(ARRAY_SECTIONS)) if (incoming[section].length) next[section] = incoming[section];
  if (incoming.customFields.length) next.customFields = incoming.customFields;
  return next;
}

$('resumeFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 9.5 * 1024 * 1024) return toast('文件不能超过 9.5MB', true);
  $('parseFile').disabled = true;
  $('parseFile').textContent = 'AI 解析中…';
  try {
    const isText = /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/');
    await persist();
    let extractedText = isText ? await readAsText(file) : '';
    const documentFile = /\.(pdf|docx)$/i.test(file.name);
    if (documentFile) {
      const { parseResumeFile } = await import('./assets/resumeParser-DF9WyGOL.js');
      const parsed = await parseResumeFile(file);
      extractedText = parsed.diagnostics?.normalizedText || JSON.stringify(parsed.profile);
    }
    const response = await chrome.runtime.sendMessage({
      type: 'QMAI_PARSE_RESUME',
      fileName: file.name,
      text: extractedText,
      fileData: isText || documentFile ? '' : await readAsDataUrl(file)
    });
    if (!response?.ok) throw new Error(response?.error || 'AI 解析失败');
    const parsed = response.data?.profile;
    if (!parsed) throw new Error('AI 没有返回结构化简历');
    current().profile = mergeParsed(current().profile, parsed);
    current().sourceFileName = file.name;
    await persist();
    render();
    toast(`解析完成，已合并到“${current().name}”`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    $('parseFile').disabled = false;
    $('parseFile').textContent = 'AI 解析文件';
  }
});

$('jsonFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await readAsText(file));
    if (Array.isArray(payload.profiles)) {
      profiles = payload.profiles.map((item, index) => ({
        ...createProfileRecord(item.name || `导入简历 ${index + 1}`),
        ...item,
        id: item.id || crypto.randomUUID(),
        profile: normalizeProfile(item.profile || item)
      }));
      if (!profiles.length) profiles = [createProfileRecord()];
      activeId = profiles[0].id;
    } else {
      current().profile = normalizeProfile(payload.profile || payload);
    }
    await persist();
    render();
    toast('JSON 简历已导入');
  } catch (error) {
    toast(`导入失败：${error.message}`, true);
  }
});

$('exportJson').addEventListener('click', () => {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), profiles }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `AI网申助手-简历备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

load().catch((error) => toast(error.message, true));
