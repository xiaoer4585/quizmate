async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('未找到当前网页');
  if (!/^https?:/i.test(tab.url || '')) throw new Error('当前页面不支持自动填写');
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content/content.js'] });
    await new Promise(resolve => setTimeout(resolve, 120));
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'downloadClient') {
    downloadClient().then(() => sendResponse({ success: true })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'listApplications') {
    getApplications().then(applications => sendResponse({ success: true, applications })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'saveApplication') {
    saveApplication(message.application).then(application => sendResponse({ success: true, application })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'deleteApplication') {
    deleteApplication(message.id).then(() => sendResponse({ success: true })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'fetchJobs') {
    fetchJobs().then(jobs => sendResponse({ success: true, jobs })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'runMonitor') {
    runMonitor().then(result => sendResponse(result)).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'setMonitor') {
    setMonitor(Boolean(message.enabled), Number(message.intervalMinutes) || 360).then(result => sendResponse(result)).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === 'parseProfile') {
    parseProfileWithAi(message.payload || {})
      .then(fields => sendResponse({ success: true, fields }))
      .catch(error => sendResponse({ success: false, error: error.message || 'AI 资料识别失败' }));
    return true;
  }
  if (!['detectForms', 'fillProfile'].includes(message?.action)) return;
  sendToActiveTab(message)
    .then(result => sendResponse(result || { success: false, error: '页面没有返回结果' }))
    .catch(error => sendResponse({ success: false, error: error.message || '自动填写失败' }));
  return true;
});

async function parseProfileWithAi(payload) {
  const { token } = await chrome.storage.local.get('token');
  if (!token) throw new Error('图片、PDF 和 Word 识别需要先登录账号');
  const response = await fetch('https://api.quizmate.vip/study-auth-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Client-Version': '2.2.0', 'X-Client-Platform': 'browser-extension' },
    body: JSON.stringify({ action: 'parseAutofillProfile', accountToken: token, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error(result.error || `资料识别请求失败（${response.status}）`);
  const fields = result.data?.fields || result.data || {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('AI 没有返回有效档案字段');
  return fields;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['autoFillEnabled', 'monitorEnabled', 'monitorInterval']);
  if (current.autoFillEnabled === undefined) await chrome.storage.local.set({ autoFillEnabled: false });
  if (current.monitorEnabled) await setMonitor(true, current.monitorInterval || 360);
});

async function getApplications() { return (await chrome.storage.local.get('applications')).applications || []; }
async function saveApplications(applications) { await chrome.storage.local.set({ applications }); }
async function saveApplication(input) {
  const applications = await getApplications();
  const application = { id: input.id || crypto.randomUUID(), ...input, updatedAt: new Date().toISOString(), createdAt: input.createdAt || new Date().toISOString(), history: input.history || [] };
  const index = applications.findIndex(item => item.id === application.id);
  if (index >= 0) applications[index] = application; else applications.unshift(application);
  await saveApplications(applications);
  return application;
}
async function deleteApplication(id) { await saveApplications((await getApplications()).filter(item => item.id !== id)); }

async function downloadClient() {
  const stableDownloadPage = 'https://www.quizmate.vip/download.html';
  try {
    const response = await fetch(stableDownloadPage, { cache: 'no-store' });
    const html = await response.text();
    const match = html.match(/href=["']([^"']*QuizMate-Windows-[^"']+\.exe)["']/i);
    if (match) {
      const downloadUrl = new URL(match[1], stableDownloadPage).href;
      await chrome.downloads.download({ url: downloadUrl, saveAs: true });
      return;
    }
  } catch {}
  await chrome.tabs.create({ url: stableDownloadPage });
}

async function fetchJobs() {
  const { token } = await chrome.storage.local.get('token');
  const response = await fetch('https://api.quizmate.vip/study-auth-api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scrapRecruitJobs', accountToken: token }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || '职位公告获取失败');
  const jobs = data.data?.jobs || data.jobs || [];
  await chrome.storage.local.set({ cachedJobs: jobs, lastJobsRefresh: new Date().toISOString() });
  return jobs;
}

async function runMonitor() {
  const applications = await getApplications();
  let changed = 0;
  for (const application of applications) {
    if (!application.url || ['offer', 'rejected'].includes(application.status)) continue;
    try {
      const response = await fetch(application.url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
      const html = await response.text();
      const hit = html.match(/笔试|笔试通知|written test/i) ? 'written_test' : html.match(/面试|面试通知|interview/i) ? 'interview' : html.match(/录用|offer|入职/i) ? 'offer' : html.match(/未通过|拒绝|遗憾|regret/i) ? 'rejected' : null;
      if (hit && hit !== application.status) {
        application.history = [...(application.history || []), { status: hit, time: new Date().toISOString(), note: '自动检测' }];
        application.status = hit; application.updatedAt = new Date().toISOString(); changed++;
      }
      application.lastChecked = new Date().toISOString();
    } catch {}
  }
  await saveApplications(applications);
  const newJobs = await monitorJobs().catch(() => 0);
  await chrome.storage.local.set({ lastMonitorRun: new Date().toISOString() });
  return { success: true, checked: applications.length, changes: changed, newJobs };
}

async function monitorJobs() {
  const stored = await chrome.storage.local.get(['knownJobKeys']);
  const known = new Set(stored.knownJobKeys || []);
  const jobs = await fetchJobs();
  const keys = jobs.map(job => String(job.id || job.url || `${job.company || ''}-${job.position || job.title || ''}`));
  const added = known.size ? jobs.filter((job, index) => !known.has(keys[index])) : [];
  await chrome.storage.local.set({ knownJobKeys: keys });
  if (added.length) await chrome.notifications.create(`jobs-${Date.now()}`, { type: 'basic', iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', title: '发现新的校招职位', message: `新增 ${added.length} 个职位，打开插件查看` });
  return added.length;
}

async function setMonitor(enabled, intervalMinutes) {
  if (enabled) await chrome.alarms.create('application-monitor', { delayInMinutes: intervalMinutes, periodInMinutes: intervalMinutes });
  else await chrome.alarms.clear('application-monitor');
  await chrome.storage.local.set({ monitorEnabled: enabled, monitorInterval: intervalMinutes });
  return { success: true, enabled, intervalMinutes };
}

chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'application-monitor') runMonitor().catch(() => {}); });
