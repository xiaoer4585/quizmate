const API = 'https://api.quizmate.vip/study-auth-api';
const TOKEN_KEY = 'token';
const ACCOUNT_KEY = 'qmaiAccount';
const $ = (s) => document.querySelector(s);
const modal = $('#authModal');
const status = $('#authStatus');

async function api(action, payload = {}) {
  const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2026.9.9', 'X-Client-Platform': 'browser-extension' }, body: JSON.stringify({ action, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) { const error = new Error(data.error || '请求失败，请稍后再试。'); error.code = data.code || 'REQUEST_FAILED'; throw error; }
  return data.data || data;
}
function setStatus(message, type = '') { status.textContent = message || ''; status.className = `auth-status ${type}`.trim(); }
function openAuth(mode = 'login') { modal.classList.remove('hidden'); switchMode(mode); $(`[data-auth-form="${mode}"] input`)?.focus(); }
function closeAuth() { modal.classList.add('hidden'); setStatus(''); }
function switchMode(mode) {
  document.querySelectorAll('[data-auth-form]').forEach((form) => { form.hidden = form.dataset.authForm !== mode; });
  $('#authTitle').textContent = mode === 'register' ? '注册账户' : mode === 'reset' ? '重置密码' : '登录账户';
  setStatus('');
}
async function saveSession(result) {
  await chrome.storage.local.set({ [TOKEN_KEY]: String(result.token || ''), [ACCOUNT_KEY]: result.account || null });
  updateAccount(result.account);
  document.dispatchEvent(new CustomEvent('qmai-auth-changed', { detail: result }));
}
function updateAccount(account) { const loggedIn = Boolean(account?.email); $('#accountStatus').textContent = loggedIn ? account.email : '未登录'; $('#authButton').textContent = loggedIn ? '退出登录' : '登录 / 注册'; }
async function init() {
  const stored = await chrome.storage.local.get([TOKEN_KEY, ACCOUNT_KEY]);
  if (stored.token && !stored[ACCOUNT_KEY]) { try { const result = await api('getAccountProfile', { accountToken: stored.token }); await chrome.storage.local.set({ [ACCOUNT_KEY]: result.account }); updateAccount(result.account); } catch { await chrome.storage.local.remove([TOKEN_KEY, ACCOUNT_KEY]); } }
  else updateAccount(stored[ACCOUNT_KEY]);
}
document.querySelectorAll('[data-close-auth]').forEach((el) => el.addEventListener('click', closeAuth));
document.querySelectorAll('[data-auth-tab]').forEach((el) => el.addEventListener('click', () => switchMode(el.dataset.authTab)));
$('#authButton').addEventListener('click', async () => { const stored = await chrome.storage.local.get(TOKEN_KEY); if (stored.token) { await chrome.storage.local.remove([TOKEN_KEY, ACCOUNT_KEY]); updateAccount(null); document.dispatchEvent(new CustomEvent('qmai-auth-changed')); } else openAuth(); });
$('[data-auth-form="login"]').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; try { setStatus('正在登录…'); const result = await api('loginAccount', { email: form.elements.email.value.trim(), password: form.elements.password.value }); await saveSession(result); closeAuth(); } catch (error) { setStatus(error.message, 'error'); } });
$('[data-auth-form="register"]').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; try { if (!/^\d{6}$/.test(form.elements.code.value.trim())) throw new Error('请输入 6 位邮箱验证码。'); setStatus('正在注册…'); const result = await api('registerAccount', { email: form.elements.email.value.trim(), code: form.elements.code.value.trim(), password: form.elements.password.value, inviteCode: form.elements.inviteCode.value.trim().toUpperCase() }); await saveSession(result); closeAuth(); } catch (error) { setStatus(error.message, 'error'); } });
$('[data-auth-form="reset"]').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; try { setStatus('正在重置…'); await api('resetAccountPassword', { email: form.elements.email.value.trim(), code: form.elements.code.value.trim(), password: form.elements.password.value }); switchMode('login'); setStatus('密码已重置，请使用新密码登录。', 'success'); } catch (error) { setStatus(error.message, 'error'); } });
document.querySelectorAll('[data-send-code]').forEach((button) => button.addEventListener('click', async () => { const form = button.closest('form'); const email = form.elements.email.value.trim(); try { if (!email) throw new Error('请先输入邮箱。'); button.disabled = true; const result = await api(button.dataset.sendCode === 'reset' ? 'sendResetPasswordCode' : 'sendRegisterCode', { email }); setStatus(result.reused ? '验证码已发送，请检查邮箱。' : '验证码已发送，请检查垃圾箱。', 'success'); setTimeout(() => { button.disabled = false; }, 60000); } catch (error) { button.disabled = false; setStatus(error.message, 'error'); } }));
init().catch(() => undefined);
export { api };
