// CHG-20260828-01 后端部署：admin-web 积分用户页新增批量调整积分（adminBatchAdjustCredits 后端 action）
// 流程：本地 dist 标记自检 → 打包 tar.gz → 上传 OSS → 云助手执行备份/覆盖/重启/校验/冒烟
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260828-01-BATCH-ADJUST-CREDITS';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;

const BACKEND_FILES = [
  'dist/src/actions/admin.js'
];

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pctEncode(value) {
  return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E');
}

function sign(query, secret) {
  return crypto.createHmac('sha1', `${secret}&`).update(`GET&${pctEncode('/')}&${pctEncode(query)}`).digest('base64');
}

async function callEcs(auth, params) {
  const common = {
    Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION,
    ...(auth.token ? { SecurityToken: auth.token } : {}), ...params
  };
  const query = Object.keys(common).sort().map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`).join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${pctEncode(sign(query, auth.sk))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runCommand(auth, command) {
  const started = await callEcs(auth, {
    Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': INSTANCE_ID,
    CommandContent: command, Timeout: '300', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root'
  });
  const invokeId = started.InvokeId;
  if (!invokeId) throw new Error('No InvokeId: ' + JSON.stringify(started));
  process.stdout.write(`INVOKE_ID=${invokeId}\n`);
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await callEcs(auth, { Action: 'DescribeInvocations', InvokeId: invokeId, RegionId: REGION });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await callEcs(auth, { Action: 'DescribeInvocationResults', InvokeId: invokeId, RegionId: REGION, InstanceId: INSTANCE_ID });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Remote deployment failed: ${status}`);
    }
    return output;
  }
  throw new Error('Remote deployment timed out');
}

async function deployBackend(auth) {
  const adminJsPath = path.join(BACKEND_DIR, 'dist/src/actions/admin.js');
  if (!fs.existsSync(adminJsPath)) throw new Error('compiled admin.js missing, run npm run build first');
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  const markers = ['adminBatchAdjustCredits', 'admin_panel_batch', 'batch_adjust_credits', 'MISSING_EMAILS', 'TOO_MANY_EMAILS'];
  for (const marker of markers) {
    if (!adminJs.includes(marker)) throw new Error(`admin.js missing marker: ${marker}`);
  }
  process.stdout.write(`LOCAL_SHA256 dist/src/actions/admin.js ${sha256(adminJs)}\n`);

  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...BACKEND_FILES]);
  const client = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined });
  await client.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = client.signatureUrl(PACKAGE_OBJECT, { expires: 600 });

  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-batch-adjust-credits-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/actions/admin.js" "\$BACKUP/admin.js"
rollback() { code=\$?; if [ -f "\$BACKUP/admin.js" ]; then cp -a "\$BACKUP/admin.js" "\$APP/dist/src/actions/admin.js"; systemctl restart quizmate-api-shadow.service || true; fi; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-batch-adjust-credits.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-batch-adjust-credits.tar.gz -C "\$APP"
grep -q 'adminBatchAdjustCredits' "\$APP/dist/src/actions/admin.js"
grep -q 'admin_panel_batch' "\$APP/dist/src/actions/admin.js"
grep -q 'batch_adjust_credits' "\$APP/dist/src/actions/admin.js"
echo '--- deployed sha256 ---'
sha256sum "\$APP/dist/src/actions/admin.js"
echo '--- functional smoke (deployed artifact) ---'
node --input-type=module -e "
const m = await import('/opt/quizmate-api-shadow/dist/src/actions/admin.js');
const stubDeps = {
  db: {
    query: async () => ({ rows: [{ count: '0' }], rowCount: 1 }),
    connect: async () => ({
      query: async () => ({ rows: [{ count: '0' }], rowCount: 1 }),
      release: () => undefined
    })
  },
  config: {}, emailCodeSecret: 'x', registerBonusCredits: 0, sessionTtlDays: 30,
  sendVerificationCode: async () => undefined, runAnalysisModel: async () => ({ items: [] }),
  adminSecret: 'secret'
};
const a = m.createAdminActions(stubDeps);
const cases = [
  ['empty_emails', { adminSecret: 'secret', emails: [], credits: 5, operation: 'add' }, 'MISSING_EMAILS'],
  ['bad_op',       { adminSecret: 'secret', emails: ['a@b.com'], credits: 5, operation: 'noop' }, 'INVALID_OPERATION'],
  ['zero_credits', { adminSecret: 'secret', emails: ['a@b.com'], credits: 0, operation: 'add' }, 'INVALID_CREDITS']
];
for (const [label, payload, expected] of cases) {
  try { await a.get('adminBatchAdjustCredits')(payload, { requestId: 't', clientIp: '127.0.0.1' }); console.log(label + '=NO_THROW'); }
  catch (e) { console.log(label + '=' + (e.code === expected)); }
}
"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
echo '--- remote API smoke ---'
curl -s -o /dev/null -w 'batch_noauth_http=%{http_code}\\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{\"action\":\"adminBatchAdjustCredits\",\"emails\":[\"a@b.com\"],\"credits\":1,\"operation\":\"add\"}'
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_BATCH_ADJUST_CREDITS_OK`);
  if (!remote.includes('DEPLOY_BATCH_ADJUST_CREDITS_OK')) throw new Error('deployment marker missing');
}

async function main() {
  const auth = credentials();
  await deployBackend(auth);
  process.stdout.write('BACKEND_DEPLOY_DONE\n');
  process.stdout.write('ALL_DEPLOY_OK\n');
}

main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.message}\n`); process.exitCode = 1; });
