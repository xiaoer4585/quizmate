import { postAction } from './api.js';
import { ACTION } from './constants.js';

export async function login(email, password) {
  const result = await postAction(ACTION.LOGIN, { email, password, deviceId: await getDeviceId(), platform: 'browser-extension', appVersion: '2.2.0' });
  const payload = result.data || {};
  if (!payload.token) throw new Error('登录成功但服务端没有返回令牌');
  await chrome.storage.local.set({ token: payload.token, user: payload.account || { email } });
  return payload;
}
export async function register(email, password, inviteCode = '') {
  const result = await postAction(ACTION.REGISTER, { email, password, inviteCode: inviteCode || undefined, deviceId: await getDeviceId(), platform: 'browser-extension', appVersion: '2.2.0' });
  const payload = result.data || {};
  if (payload.token) await chrome.storage.local.set({ token: payload.token, user: payload.account || { email } });
  return payload;
}
export async function logout() { try { await postAction(ACTION.LOGOUT); } finally { await chrome.storage.local.remove(['token', 'user']); } }
export async function isAuthenticated() {
  const { token } = await chrome.storage.local.get('token');
  if (!token) return false;
  try { const result = await getProfile(); if (result.data?.account) await chrome.storage.local.set({ user: result.data.account }); return true; } catch { await chrome.storage.local.remove(['token', 'user']); return false; }
}
export async function getCachedUser() { return (await chrome.storage.local.get('user')).user || null; }
async function getDeviceId() {
  const stored = await chrome.storage.local.get('deviceId');
  if (stored.deviceId) return stored.deviceId;
  const deviceId = `ext-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ deviceId });
  return deviceId;
}
