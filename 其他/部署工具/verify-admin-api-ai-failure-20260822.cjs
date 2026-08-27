// verify-admin-api-ai-failure-20260822.cjs
// 探活 adminListModelCallFailures 接口 + 新增菜单可达性
const https = require('https');

const API_BASE = 'https://api.quizmate.vip';

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Type': 'application/json', ...headers } };
    const req = require('https').request(opts, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('STEP 1: no-auth probe (must be 400/401/403)');
  const probe = await postJSON(`${API_BASE}/study-auth-api`, { action: 'adminListModelCallFailures', page: 1, pageSize: 10 });
  console.log('NO_AUTH_STATUS', probe.status, probe.body.slice(0, 200));
  if (![400, 401, 403].includes(probe.status)) throw new Error(`Unexpected no-auth status ${probe.status}`);

  console.log('STEP 2: admin dashboard reachability (should be non-5xx)');
  const dash = await postJSON(`${API_BASE}/study-auth-api`, { action: 'adminDashboardSummary' });
  console.log('DASH_STATUS', dash.status, dash.body.slice(0, 200));
  if (dash.status >= 500) throw new Error('Dashboard endpoint 5xx');

  console.log('VERIFY_AI_FAILURE_API_OK');
})().catch((e) => {
  console.error('VERIFY_AI_FAILURE_API_FAIL', e.message);
  process.exitCode = 1;
});
