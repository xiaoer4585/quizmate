const API_BASE_URL = 'https://api.quizmate.vip/study-auth-api';
import {
  ACTIVE_PROFILE_KEY,
  DEFAULT_SETTINGS,
  PROFILE_STORAGE_KEY,
  SETTINGS_KEY,
  createExampleProfileRecord,
  normalizeProfile,
  toOfferFlowProfile,
  valueAtPath
} from './profile-schema.js';

const CONTENT_FILES = [
  'adapter-registry.js',
  'extraction-rules.js',
  'form-adapters.js',
  'form-runtime.js',
  'form-control-drivers.js',
  'content.js'
];

const PERSONAL_ACTION = Object.freeze({
  PING: 'personalResumePing',
  PARSE: 'personalParseAutofillProfile',
  FILL: 'personalAiFillForm',

});

const fillLocks = new Map();

function emitProgress(payload) {
  chrome.runtime.sendMessage({ type: 'QMAI_PROGRESS', ...payload }).catch(() => undefined);
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function postAction(action, input = {}, timeoutMs = 90000) {
  const stored = await chrome.storage.local.get(['token']);
  if (!stored.token) {
    const error = new Error('请先登录 QuizMate 账号，再使用简历解析或 AI 填写。');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const actionName = action === PERSONAL_ACTION.PING ? 'getAccountProfile' : action === PERSONAL_ACTION.PARSE ? 'parseAutofillProfile' : 'aiFillForm';
  const response = await fetch(API_BASE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2026.9.9', 'X-Client-Platform': 'browser-extension' }, body: JSON.stringify({ action: actionName, ...(stored.token ? { accountToken: stored.token } : {}), ...input }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    if (response.status === 401 || data.code === 'SESSION_EXPIRED') await chrome.storage.local.remove(['token', 'qmaiAccount']);
    const error = new Error(data.error || `后台请求失败（${response.status}）`);
    error.code = data.code || `HTTP_${response.status}`;
    throw error;
  }
  return data.data || data;
}

async function fetchBackendPageRules(hostname, fields) {
  if (!hostname || !Array.isArray(fields)) return [];
  const stored = await chrome.storage.local.get(['token']);
  if (!stored.token) return [];
  const signatures = fields.map((field) => String(field.fingerprint || field.id || '').trim()).filter(Boolean).slice(0, 500);
  if (!signatures.length) return [];
  try {
    const response = await fetch(API_BASE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2026.9.9', 'X-Client-Platform': 'browser-extension' }, body: JSON.stringify({ action: 'getResumePageRules', accountToken: stored.token, hostname, signatures }) });
    const data = await response.json().catch(() => ({}));
    return response.ok && data.ok === true ? (data.data?.rules || data.rules || []) : [];
  } catch { return []; }
}

async function recordBackendReport(page, fields, results) {
  const stored = await chrome.storage.local.get(['token']);
  if (!stored.token || !page?.hostname) return;
  const byId = new Map((results || []).map((row) => [String(row.fieldId || row.id || ''), row]));
  const safeFields = (fields || []).slice(0, 500).map((field) => {
    const result = byId.get(String(field.id || ''));
    return { fieldId: field.id, label: field.label || '', controlType: field.type || 'text', sectionKind: field.repeatGroup || '', sectionIndex: field.repeatIndex || 0, signature: field.fingerprint || field.id, status: result?.ok === false ? 'failed' : result ? 'filled' : 'unmatched', sourcePath: field.key || '', reason: result?.reason || '' };
  });
  try { await fetch(API_BASE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2026.9.9', 'X-Client-Platform': 'browser-extension' }, body: JSON.stringify({ action: 'recordResumeFillReport', accountToken: stored.token, page, fields: safeFields }) }); } catch { /* report is best effort */ }
}

async function getActiveProfile() {
  const stored = await chrome.storage.local.get([PROFILE_STORAGE_KEY, ACTIVE_PROFILE_KEY]);
  const profiles = Array.isArray(stored[PROFILE_STORAGE_KEY]) ? stored[PROFILE_STORAGE_KEY] : [];
  if (!profiles.length) return null;
  return profiles.find((item) => item.id === stored[ACTIVE_PROFILE_KEY]) || profiles[0];
}

async function currentTab(sender) {
  if (sender?.tab?.id) return sender.tab;
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function sendToFrame(tabId, frameId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function injectRuntime(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
}

async function listFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return (frames || []).filter((frame) => Number.isInteger(frame.frameId));
  } catch {
    return [{ frameId: 0, url: '' }];
  }
}

async function applyBackendSiteEngine(tab) {
  const stored = await chrome.storage.local.get(['token']);
  if (!stored.token || !tab?.id) return;
  let hostname = '';
  try { hostname = new URL(tab.url || '').hostname; } catch { return; }
  if (!hostname) return;
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2026.9.9', 'X-Client-Platform': 'browser-extension' },
      body: JSON.stringify({ action: 'getSiteEngineConfig', accountToken: stored.token, hostname })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true || !payload.data?.siteConfig) return;
    const frames = await listFrames(tab.id);
    await Promise.allSettled(frames.map((frame) => sendToFrame(tab.id, frame.frameId, { type: 'OFFERFLOW_APPLY_SITE_ENGINE', config: payload.data.siteConfig })));
  } catch {
    // 扫描仍可使用已打包的通用 DOM 运行时；服务端热规则在网络恢复后自动生效。
  }
}

async function scanFrames(tab) {
  await applyBackendSiteEngine(tab);
  let frames = await listFrames(tab.id);
  const scanOnce = async () => {
    const settled = await Promise.allSettled(frames.map(async (frame) => {
      const scan = await sendToFrame(tab.id, frame.frameId, { type: 'OFFERFLOW_SCAN_APPLICATION_FORM_V2', expandRepeaters: false });
      if (!scan?.ok || !Array.isArray(scan.fields) || !scan.fields.length) return null;
      return { frameId: frame.frameId, frameUrl: frame.url || '', ...scan };
    }));
    return settled.flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : []);
  };
  let reports = await scanOnce();
  if (!reports.length) {
    await injectRuntime(tab.id).catch(() => undefined);
    frames = await listFrames(tab.id);
    reports = await scanOnce();
  }
  return reports;
}

function pageField(frameReport, field) {
  const fieldId = `${frameReport.frameId}::${field.id}`;
  const options = (Array.isArray(field.options) ? field.options : []).slice(0, 100).map((item) => {
    if (item && typeof item === 'object') return { label: String(item.label ?? item.text ?? item.value ?? ''), value: String(item.value ?? item.label ?? item.text ?? '') };
    return { label: String(item ?? ''), value: String(item ?? '') };
  });
  return {
    fieldId,
    frameId: frameReport.frameId,
    label: String(field.label || '').slice(0, 300),
    section: String(field.section || '').slice(0, 300),
    sectionKind: field.repeatGroup || '',
    sectionIndex: Number.isInteger(field.repeatIndex) ? field.repeatIndex : 0,
    controlType: field.type || 'text',
    required: Boolean(field.required),
    options,
    currentValue: String(field.currentValue || '').slice(0, 1000),
    semanticKey: field.key || '',
    signature: field.fingerprint || field.id,
    adapterId: field.adapterId || frameReport.platform?.id || 'generic',
    evidence: Array.isArray(field.evidence) ? field.evidence.slice(0, 8) : []
  };
}

function planValue(item, profile) {
  const fromProfile = valueAtPath(profile, item.profilePath || item.sourcePath || '');
  if (fromProfile) return fromProfile;
  const explicit = [item.optionLabel, item.optionValue, item.value].find(v => v != null && String(v).trim());
  if (explicit != null && String(explicit).trim()) return String(explicit);
  return valueAtPath(profile, item.profilePath || item.sourcePath || '');
}

function shouldUseField(field, onlyEmpty) {
  if (!onlyEmpty) return true;
  if (/密码|验证码|隐私|授权|password|captcha|verification code|consent/i.test(field.label || '')) return false;
  return /^(?:请选择.*|请选择|select.*|please select.*|--.*--)?$/i.test(String(field.currentValue || '').trim());
}

async function capture(tab) {
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 58 });
  } catch {
    return '';
  }
}

async function fillTab(tab) {
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) throw new Error('当前页面不是可填写的网页');
  if (fillLocks.has(tab.id)) throw new Error('当前页面正在填写，请等待本轮结束');
  const running = orchestrateFill(tab).finally(() => fillLocks.delete(tab.id));
  fillLocks.set(tab.id, running);
  return running;
}

async function orchestrateFill(tab) {
  const profileRecord = await getActiveProfile();
  if (!profileRecord?.profile) throw new Error('还没有简历，请先创建或导入简历');
  const profile = normalizeProfile(profileRecord.profile);
  const settings = await getSettings();
  emitProgress({ phase: 'scanning', message: '正在识别当前页面和嵌套表单…' });
  const frameReports = await scanFrames(tab);
  const allFields = frameReports.flatMap((report) => report.fields.map((field) => pageField(report, field)));
  const eligibleFields = allFields.filter((field) => shouldUseField(field, settings.fillOnlyEmpty)).slice(0, 700);
  if (!eligibleFields.length) throw new Error(allFields.length ? '当前字段已有内容，无需填写' : '未识别到可填写字段');

  const pageUrl = frameReports.find((report) => report.frameId === 0)?.frameUrl || tab.url || '';
  const hostname = (() => { try { return new URL(pageUrl).hostname; } catch { return ''; } })();
  const backendRules = await fetchBackendPageRules(hostname, frameReports.flatMap((report) => report.fields));
  const ruleBySignature = new Map(backendRules.map((rule) => [String(rule.signature || ''), rule]));
  for (const report of frameReports) for (const field of report.fields) {
    const rule = ruleBySignature.get(String(field.fingerprint || field.id || ''));
    if (rule?.sourcePath && !field.key) field.key = String(rule.sourcePath);
  }
  const screenshot = settings.useVision ? await capture(tab) : '';

  emitProgress({ phase: 'planning', message: `AI 正在核对 ${eligibleFields.length} 个字段…`, detected: eligibleFields.length });
  let plan = [];
  let aiError = '';
  try {
    const data = await postAction(PERSONAL_ACTION.FILL, {
      requestId: `personal_fill_${crypto.randomUUID()}`,
      fields: eligibleFields,
      profile,
      page: { url: pageUrl, title: tab.title || '', hostname, language: /[\u4e00-\u9fff]/.test(tab.title || '') ? 'zh' : 'auto' },
      screenshot
    }, 105000);
    plan = Array.isArray(data.plan) ? data.plan : [];
  } catch (error) {
    aiError = error?.message || 'AI 规划失败';
  }

  const offerFlow = toOfferFlowProfile(profile);
  const fieldsByFrame = new Map();
  const valuesByFrame = new Map();
  for (const report of frameReports) {
    fieldsByFrame.set(report.frameId, report.fields.filter((field) => shouldUseField(field, settings.fillOnlyEmpty)));
    valuesByFrame.set(report.frameId, {});
  }

  // 本地映射先填入，AI 按实际字段覆盖。
  for (const report of frameReports) {
    const target = valuesByFrame.get(report.frameId);
    for (const field of report.fields) {
      if (!shouldUseField(field, settings.fillOnlyEmpty)) continue;
      const index = field.repeatGroup === 'experience' && /工作|work/i.test(field.section || '') && !/实习|intern/i.test(field.section || '') ? profile.internships.length + (field.repeatIndex || 0) : (field.repeatIndex || 0);
      const value = field.key ? offerFlow.snapshots[index]?.[field.key] : '';
      if (value != null && String(value).trim()) target[field.id] = String(value);
    }
  }
  for (const item of plan) {
    const composite = String(item.fieldId || '');
    const separator = composite.indexOf('::');
    const frameId = separator >= 0 ? Number(composite.slice(0, separator)) : Number(item.frameId || 0);
    const rawId = separator >= 0 ? composite.slice(separator + 2) : composite;
    const value = planValue(item, profile);
    if (!rawId || !valuesByFrame.has(frameId) || !String(value || '').trim() || !fieldsByFrame.get(frameId)?.some(f => f.id === rawId) || Number(item.confidence ?? 0.9) < 0.8) continue;
    valuesByFrame.get(frameId)[rawId] = String(value);
    const targetField = fieldsByFrame.get(frameId).find(f => f.id === rawId);
    if (!targetField.key) targetField.key = `ai:${rawId}`;
  }

  emitProgress({ phase: 'filling', message: aiError ? `AI 暂不可用，正在用本地规则填写：${aiError}` : '正在逐项填写并回读校验…' });
  const settled = await Promise.allSettled(frameReports.map(async (report) => {
    const fields = fieldsByFrame.get(report.frameId) || [];
    if (!fields.length) return { frameId: report.frameId, filled: 0, unfilled: 0, results: [] };
    const response = await sendToFrame(tab.id, report.frameId, {
      type: 'OFFERFLOW_FILL_APPLICATION_FORM_V2',
      fields,
      values: offerFlow.values,
      fieldValues: valuesByFrame.get(report.frameId),
      profileSnapshots: offerFlow.snapshots,
      repeatCounts: offerFlow.repeatCounts,
      repeatPlan: offerFlow.repeatPlan,
      delayMs: Number(settings.fillDelayMs) || 55,
      maxRounds: Number(settings.maxRounds) || 3,
      onlyEmpty: settings.fillOnlyEmpty !== false,
      fillDynamicFields: true
    });
    if (!response?.ok) throw new Error(response?.error || '页面填写失败');
    return { frameId: report.frameId, ...response };
  }));

  const reports = settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []);
  const errors = settled.flatMap((item) => item.status === 'rejected' ? [item.reason?.message || '填写失败'] : []);
  const filled = reports.reduce((sum, report) => sum + Number(report.filled || 0), 0);
  const unfilled = reports.reduce((sum, report) => sum + Number(report.unfilled || 0), 0);
  const results = reports.flatMap((report) => (report.results || []).map((result) => ({ frameId: report.frameId, ...result })));
  const summary = { detected: eligibleFields.length, planned: plan.length, filled, unfilled, aiFallback: Boolean(aiError), aiError, errors, results };
  await recordBackendReport({ url: pageUrl, hostname, title: tab.title || '' }, allFields, results);
  emitProgress({ phase: 'done', message: `完成：已填写 ${filled} 项，待人工确认 ${unfilled} 项`, summary });
  return summary;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('resume.html') });
    return;
  }
  try {
    await sendToFrame(tab.id, 0, { type: 'OFFERFLOW_TOGGLE_OVERLAY' });
  } catch {
    try {
      await injectRuntime(tab.id);
      await sendToFrame(tab.id, 0, { type: 'OFFERFLOW_TOGGLE_OVERLAY' });
    } catch {
      await chrome.tabs.create({ url: chrome.runtime.getURL('resume.html') });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'OFFERFLOW_FILL_PROGRESS') {
    emitProgress({ phase: 'filling', current: message.current, total: message.total, filled: message.filled });
    return false;
  }
  const run = async () => {
    switch (message.type) {
      case 'QMAI_OPEN_RESUME':
        await chrome.tabs.create({ url: chrome.runtime.getURL('resume.html') });
        return { ok: true };
      case 'QMAI_TEST_CONNECTION':
        return { ok: true, data: await postAction(PERSONAL_ACTION.PING, {}, 15000) };
      case 'QMAI_PARSE_RESUME':
        return { ok: true, data: await postAction(PERSONAL_ACTION.PARSE, {
          requestId: `personal_parse_${crypto.randomUUID()}`,
          fileName: message.fileName || '',
          fileData: message.fileData || '',
          text: message.text || '',
          language: 'auto'
        }, 120000) };
      case 'QMAI_SCAN_FORM': {
        const tab = await currentTab(sender);
        if (!tab) throw new Error('未找到当前网页');
        const reports = await scanFrames(tab);
        return {
          ok: true,
          data: {
            total: reports.reduce((sum, report) => sum + report.fields.length, 0),
            platforms: [...new Set(reports.map((report) => report.platform?.name || report.platform?.id).filter(Boolean))],
            fields: reports.flatMap((report) => report.fields.map((field) => ({ label: field.label, key: field.key, type: field.type, required: field.required }))).slice(0, 80)
          }
        };
      }
      case 'QMAI_START_FILL': {
        const tab = await currentTab(sender);
        return { ok: true, data: await fillTab(tab) };
      }
      default:
        return null;
    }
  };
  if (!['QMAI_OPEN_RESUME', 'QMAI_TEST_CONNECTION', 'QMAI_PARSE_RESUME', 'QMAI_SCAN_FORM', 'QMAI_START_FILL'].includes(message.type)) return false;
  run().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error?.message || '操作失败', code: error?.code || '' }));
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, PROFILE_STORAGE_KEY, ACTIVE_PROFILE_KEY]);
  if (!stored[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
  if (!Array.isArray(stored[PROFILE_STORAGE_KEY]) || !stored[PROFILE_STORAGE_KEY].length) {
    const example = createExampleProfileRecord();
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: [example], [ACTIVE_PROFILE_KEY]: example.id });
  }
});
