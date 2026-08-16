import { API_BASE_URL, ACTION } from './constants.js';

export async function postAction(action, input = {}) {
  const { token } = await chrome.storage.local.get('token');
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Client-Version': '2.2.0', 'X-Client-Platform': 'browser-extension' },
    body: JSON.stringify({ action, ...(token ? { accountToken: token } : {}), ...input })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export async function getProfile() { return postAction(ACTION.PROFILE); }
