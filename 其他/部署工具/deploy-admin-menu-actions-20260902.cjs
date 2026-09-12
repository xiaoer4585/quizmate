// CHG-20260902-01: deploy admin menu action fix (backend + quizmate-vip admin web).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, '注册登陆模块/阿里云后端-quizmate-api');
const ADMIN = path.join(ROOT, '官网模块/正式官网-quizmate.vip/admin-web');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const CHANGE_ID = 'CHG-20260905-10';
const PACKAGE_FILE = path.join(ROOT, 'tmp', `quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;
const BACKEND_FILES = ['dist/src/actions/admin.js', 'dist/src/actions/activities.js', 'dist/src/actions/index.js', 'dist/src/actions/site-engine.js', 'migrations/014_model_call_failures.sql', 'migrations/015_xiaohongshu_rewards.sql', 'migrations/022_model_failure_whitelist.sql'];

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function credentials() {
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile unavailable');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}
function enc(value) { return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E'); }
function sign(query, secret) { return crypto.createHmac('sha1', `${secret}&`).update(`GET&${enc('/')}&${enc(query)}`).digest('base64'); }
async function ecs(auth, params) {
  const common = { Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION, ...(auth.token ? { SecurityToken: auth.token } : {}), ...params };
  const query = Object.keys(common).sort().map((key) => `${enc(key)}=${enc(common[key])}`).join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${enc(sign(query, auth.sk))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}
async function runCommand(auth, command) {
  const started = await ecs(auth, { Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': INSTANCE_ID, CommandContent: command, Timeout: '600', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root' });
  const deadline = Date.now() + 720000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await ecs(auth, { Action: 'DescribeInvocations', InvokeId: started.InvokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await ecs(auth, { Action: 'DescribeInvocationResults', InvokeId: started.InvokeId, InstanceId: INSTANCE_ID });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || Number(row.ExitCode || 0) !== 0) throw new Error(`remote command failed: ${status}`);
    return output;
  }
  throw new Error('remote command timed out');
}
function checkLocal() {
  for (const file of BACKEND_FILES) {
    const full = path.join(BACKEND, file);
    if (!fs.existsSync(full)) throw new Error(`missing ${file}`);
    process.stdout.write(`LOCAL_SHA256 ${file} ${sha256(fs.readFileSync(full))}\n`);
  }
  const html = fs.readFileSync(path.join(ADMIN, 'index.html'), 'utf8');
  for (const marker of ['data-view-tab="xiaohongshuReviews"', 'data-view-tab="aiFailures"', 'adminListModelCallFailures', 'adminGetModelFailureWhitelist', 'deleteSelectedAiFailuresBtn', 'data-model-failure-select-all']) if (!html.includes(marker)) throw new Error(`admin page missing ${marker}`);
  if (!fs.readFileSync(path.join(ADMIN, 'xiaohongshu-review.js'), 'utf8').includes('adminListXiaohongshuRewards')) throw new Error('xiaohongshu review asset missing action marker');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()?.[1] || '';
  new (require('vm').Script)(script, { filename: 'admin-web-inline.js' });
}

async function deployBackend(auth) {
  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND, ...BACKEND_FILES]);
  const storage = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120000 });
  await storage.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const url = storage.signatureUrl(PACKAGE_OBJECT, { expires: 600 });
  const output = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-admin-menu-actions-\$TS
mkdir -p "\$BACKUP"
for f in admin.js activities.js index.js site-engine.js; do [ -f "\$APP/dist/src/actions/\$f" ] && cp -a "\$APP/dist/src/actions/\$f" "\$BACKUP/\$f"; done
rollback() { code=\$?; for f in admin.js activities.js index.js site-engine.js; do [ -f "\$BACKUP/\$f" ] && cp -a "\$BACKUP/\$f" "\$APP/dist/src/actions/\$f"; done; systemctl restart quizmate-api-shadow.service || true; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/${CHANGE_ID}.tar.gz '${url}'
tar -xzf /tmp/${CHANGE_ID}.tar.gz -C "\$APP"
grep -q adminListXiaohongshuRewards "\$APP/dist/src/actions/activities.js"
grep -q adminListModelCallFailures "\$APP/dist/src/actions/admin.js"
grep -q adminDeleteModelCallFailures "\$APP/dist/src/actions/admin.js"
grep -q createActivityActions "\$APP/dist/src/actions/index.js"
cd "\$APP"; set -a; . /etc/quizmate-api-shadow.env; set +a
node_modules/.bin/tsx scripts/migrate.ts 2>&1 | tail -20
systemctl restart quizmate-api-shadow.service
for i in 1 2 3 4 5 6 7 8 9 10; do
  status=$(systemctl is-active quizmate-api-shadow.service || true)
  [ "$status" = "active" ] && break
  sleep 2
done
systemctl is-active quizmate-api-shadow.service
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  curl -fsS http://127.0.0.1:8200/health && break
  sleep 2
done
echo
for action in adminListXiaohongshuRewards adminListModelCallFailures adminGetModelFailureWhitelist adminDeleteModelCallFailures; do curl -s -o /tmp/admin-action.json -w 'action_http=%{http_code}\\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d "{\\"action\\":\\"\$action\\"}"; if grep -q UNKNOWN_ACTION /tmp/admin-action.json; then exit 1; fi; done
echo BACKUP=\$BACKUP
echo DEPLOY_ADMIN_MENU_ACTIONS_OK`);
  if (!output.includes('DEPLOY_ADMIN_MENU_ACTIONS_OK')) throw new Error('backend deployment marker missing');
}

async function deployAdmin(auth) {
  const storage = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120000 });
  const htmlPath = path.join(ADMIN, 'index.html');
  const backupKey = `rollback/${CHANGE_ID}/admin-web.index.before.html`;
  const previous = await storage.get('admin-web/index.html');
  await storage.put(backupKey, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  await storage.put('admin-web/index.html', htmlPath, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  for (const asset of ['xiaohongshu-review.js', 'xiaohongshu-review.css']) await storage.put(`admin-web/${asset}`, path.join(ADMIN, asset), { headers: { 'Cache-Control': 'no-cache' } });
  const remote = await storage.get('admin-web/index.html');
  if (sha256(remote.content) !== sha256(fs.readFileSync(htmlPath))) throw new Error('admin-web hash mismatch');
  process.stdout.write(`ADMIN_WEB_BACKUP=${backupKey}\nADMIN_WEB_SHA256=${sha256(remote.content)}\nADMIN_WEB_UPLOAD_OK\n`);
}

async function main() { checkLocal(); const auth = credentials(); await deployBackend(auth); await deployAdmin(auth); }
main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.stack || error.message}\n`); process.exitCode = 1; });
