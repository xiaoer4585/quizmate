// CHG-20260913-02: deploy credit-ledger and interview response changes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260913-02';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;
const FILES = [
  'dist/src/actions/accounts.js',
  'dist/src/actions/configuration.js',
  'dist/src/actions/speech.js',
  'dist/src/actions/index.js'
];

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile missing');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}
function encode(value) { return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E'); }
function sign(query, secret) { return crypto.createHmac('sha1', `${secret}&`).update(`GET&${encode('/')}&${encode(query)}`).digest('base64'); }
async function ecs(auth, params) {
  const common = { Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION, ...(auth.token ? { SecurityToken: auth.token } : {}), ...params };
  const query = Object.keys(common).sort().map((key) => `${encode(key)}=${encode(common[key])}`).join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${encode(sign(query, auth.sk))}`);
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
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) throw new Error(`remote deployment failed: ${status}`);
    return output;
  }
  throw new Error('remote deployment timed out');
}

async function main() {
  for (const file of FILES) if (!fs.existsSync(path.join(BACKEND_DIR, file))) throw new Error(`missing ${file}`);
  for (const [file, marker] of [
    ['dist/src/actions/accounts.js', 'getCreditLedger'],
    ['dist/src/actions/configuration.js', '网申助手'],
    ['dist/src/actions/speech.js', '换行'],
    ['dist/src/actions/index.js', 'accounts']
  ]) if (!fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8').includes(marker)) throw new Error(`${file} missing marker ${marker}`);

  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...FILES]);
  process.stdout.write(`PACKAGE_SHA256=${crypto.createHash('sha256').update(fs.readFileSync(PACKAGE_FILE)).digest('hex')}\n`);
  const auth = credentials();
  const oss = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 300000 });
  await oss.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = oss.signatureUrl(PACKAGE_OBJECT, { expires: 900 });
  const remote = [
    'set -Eeuo pipefail',
    'TS=$(date +%Y%m%d-%H%M%S)',
    'APP=/opt/quizmate-api-shadow',
    `BACKUP=$APP.rollback-${CHANGE_ID}-$TS`,
    'mkdir -p "$BACKUP/actions"',
    'cp -a "$APP/dist/src/actions/." "$BACKUP/actions/"',
    'echo "BACKUP_DIR=$BACKUP"',
    'rollback() { code=$?; cp -a "$BACKUP/actions/." "$APP/dist/src/actions/"; systemctl restart quizmate-api-shadow.service || true; echo AUTO_ROLLBACK_DONE; exit $code; }',
    'trap rollback ERR',
    `curl -fsSL -o /tmp/quizmate-api-${CHANGE_ID}.tar.gz '${signedUrl}'`,
    `tar -xzf /tmp/quizmate-api-${CHANGE_ID}.tar.gz -C "$APP"`,
    'systemctl restart quizmate-api-shadow.service',
    'sleep 3',
    'test "$(systemctl is-active quizmate-api-shadow.service)" = active',
    'curl -fsS http://127.0.0.1:8200/health',
    'echo',
    `curl -sS -o /tmp/credit-ledger-noauth-${CHANGE_ID}.json -w 'credit_ledger_noauth_http=%{http_code}\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{"action":"getCreditLedger","page":1,"pageSize":1}'`,
    `grep -Eq 'AUTH_REQUIRED|请先登录' /tmp/credit-ledger-noauth-${CHANGE_ID}.json`,
    'trap - ERR',
    'echo API_CREDIT_LEDGER_DEPLOY_OK'
  ].join('\n');
  const output = await runCommand(auth, remote);
  if (!output.includes('API_CREDIT_LEDGER_DEPLOY_OK')) throw new Error('deployment marker missing');
}

main().catch((error) => { console.error('API_DEPLOY_FAILED', error.message); process.exitCode = 1; });
