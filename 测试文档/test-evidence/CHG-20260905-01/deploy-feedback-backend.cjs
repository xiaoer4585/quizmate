const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OSS = require('../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');
const ROOT = path.resolve(__dirname, '../../..');
const BACKEND = path.join(ROOT, '注册登陆模块/阿里云后端-quizmate-api');
const ADMIN = path.join(ROOT, '官网模块/正式官网-quizmate.vip/admin-web/index.html');
const CHANGE_ID = 'CHG-20260905-01';
const REGION = 'cn-beijing';
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const packageFile = path.join(ROOT, 'tmp', `quizmate-api-${CHANGE_ID}-feedback.tar.gz`);
const packageObject = `deploy/quizmate-api-${CHANGE_ID}-feedback.tar.gz`;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile unavailable');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}
const enc = (value) => encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E');
const sign = (query, secret) => crypto.createHmac('sha1', `${secret}&`).update(`GET&${enc('/')}&${enc(query)}`).digest('base64');
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
  const deadline = Date.now() + 720_000;
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

async function deployBackend(auth) {
  const files = ['dist/src/actions/feedback.js', 'migrations/020_feedback.sql'];
  for (const file of files) {
    const full = path.join(BACKEND, file);
    if (!fs.existsSync(full)) throw new Error(`missing backend artifact ${file}`);
    process.stdout.write(`LOCAL_SHA256 ${file} ${sha256(fs.readFileSync(full))}\n`);
  }
  fs.mkdirSync(path.dirname(packageFile), { recursive: true });
  execFileSync('tar', ['-czf', packageFile, '-C', BACKEND, ...files]);
  const storage = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-vip', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120000 });
  await storage.put(packageObject, packageFile, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const url = storage.signatureUrl(packageObject, { expires: 600 });
  const output = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-feedback-${CHANGE_ID}-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/actions/index.js" "\$BACKUP/index.js"
[ ! -f "\$APP/dist/src/actions/feedback.js" ] || cp -a "\$APP/dist/src/actions/feedback.js" "\$BACKUP/feedback.js"
rollback() { code=\$?; cp -a "\$BACKUP/index.js" "\$APP/dist/src/actions/index.js"; [ ! -f "\$BACKUP/feedback.js" ] || cp -a "\$BACKUP/feedback.js" "\$APP/dist/src/actions/feedback.js"; systemctl restart quizmate-api-shadow.service || true; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/${CHANGE_ID}-feedback.tar.gz '${url}'
tar -xzf /tmp/${CHANGE_ID}-feedback.tar.gz -C "\$APP"
INDEX="\$APP/dist/src/actions/index.js"
node --input-type=module - "\$INDEX" <<'NODE'
import fs from 'node:fs';
const file = process.argv[2];
let source = fs.readFileSync(file, 'utf8');
if (!source.includes('createFeedbackActions')) {
  const importMarker = 'import { createActivityActions } from "./activities.js";';
  if (!source.includes(importMarker)) throw new Error('feedback import anchor missing');
  source = source.replace(importMarker, importMarker + '\\nimport { createFeedbackActions } from "./feedback.js";');
  const actionMarker = '...createActivityActions(deps)';
  if (!source.includes(actionMarker)) throw new Error('feedback action anchor missing');
  source = source.replace(actionMarker, actionMarker + ',\\n        ...createFeedbackActions(deps)');
  fs.writeFileSync(file, source);
}
NODE
grep -q createFeedbackActions "\$INDEX"
grep -q submitFeedback "\$APP/dist/src/actions/feedback.js"
cd "\$APP"; set -a; . /etc/quizmate-api-shadow.env; set +a
node_modules/.bin/tsx scripts/migrate.ts 2>&1 | tail -20
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
for action in submitFeedback adminListFeedback getClientAnnouncements adminGetAnnouncements adminSetAnnouncements; do
  code=\$(curl -s -o /tmp/feedback-action.json -w '%{http_code}' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d "{\"action\":\"\$action\",\"payload\":{}}")
  if grep -q UNKNOWN_ACTION /tmp/feedback-action.json; then cat /tmp/feedback-action.json; exit 1; fi
  echo "ACTION_OK \$action HTTP=\$code"
done
echo BACKUP=\$BACKUP
echo DEPLOY_FEEDBACK_BACKEND_OK`);
  if (!output.includes('DEPLOY_FEEDBACK_BACKEND_OK')) throw new Error('backend deployment marker missing');
}

async function deployAdmin(auth) {
  const storage = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120000 });
  const html = fs.readFileSync(ADMIN);
  for (const marker of ['data-view-tab="feedback"', '问题反馈', 'adminListFeedback', 'saveAnnouncementsBtn']) if (!html.toString('utf8').includes(marker)) throw new Error(`admin marker missing ${marker}`);
  const backup = `rollback/${CHANGE_ID}/admin-web.index.before-feedback.html`;
  const previous = await storage.get('admin-web/index.html');
  await storage.put(backup, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  await storage.put('admin-web/index.html', html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  const remote = await storage.get('admin-web/index.html');
  if (sha256(remote.content) !== sha256(html)) throw new Error('admin-web hash mismatch');
  process.stdout.write(`ADMIN_WEB_BACKUP=${backup}\nADMIN_WEB_SHA256=${sha256(remote.content)}\nADMIN_WEB_UPLOAD_OK\n`);
}

async function main() {
  const auth = credentials();
  await deployBackend(auth);
  await deployAdmin(auth);
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAILED ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
