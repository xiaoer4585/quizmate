// CHG-20260822-04 后端部署：adminListCreditAccounts 增加 platform 标签与筛选（仅改动 dist/src/actions/admin.js，无迁移）
// 流程：本地 dist 标记自检 → 打包 tar.gz → 上传 OSS → 云助手执行备份/覆盖/重启/校验/冒烟
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260822-04-CREDIT-ACCOUNT-PLATFORM';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;

const BACKEND_FILES = [
  'dist/src/actions/admin.js',
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

function pctEncode(value) { return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E'); }
function sign(query, secret) { return crypto.createHmac('sha1', `${secret}&`).update(`GET&${pctEncode('/')}&${pctEncode(query)}`).digest('base64'); }

async function callEcs(auth, params) {
  const common = { Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION, ...(auth.token ? { SecurityToken: auth.token } : {}), ...params };
  const query = Object.keys(common).sort().map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`).join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${pctEncode(sign(query, auth.sk))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runCommand(auth, command) {
  const started = await callEcs(auth, { Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': INSTANCE_ID, CommandContent: command, Timeout: '300', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root' });
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await callEcs(auth, { Action: 'DescribeInvocations', InvokeId: started.InvokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await callEcs(auth, { Action: 'DescribeInvocationResults', InvokeId: started.InvokeId, InstanceId: INSTANCE_ID });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) throw new Error(`Remote deployment failed: ${status}`);
    return output;
  }
  throw new Error('Remote deployment timed out');
}

async function deployBackend(auth) {
  // 校验编译产物包含本次功能标记（账号列表 platform）
  const checks = [
    ['dist/src/actions/admin.js', ['LEFT JOIN LATERAL', 'session_platform', 'INVALID_PLATFORM', 'win32-desktop', 'browser-extension', 'adminListCreditAccounts']],
  ];
  for (const [file, markers] of checks) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of markers) {
      if (!content.includes(marker)) throw new Error(`${file} lacks marker ${marker}`);
    }
  }
  // 不应夹带未发布的并行改动
  const mustNotContain = ['redemption', 'oldUserBonus', 'OLD_USER_RECHARGE_BONUS', 'interviewWindowActions'];
  for (const file of BACKEND_FILES) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of mustNotContain) {
      if (content.includes(marker)) throw new Error(`${file} contains unexpected marker ${marker}`);
    }
  }
  for (const file of BACKEND_FILES) {
    process.stdout.write(`LOCAL_SHA256 ${path.basename(file)} ${sha256(fs.readFileSync(path.join(BACKEND_DIR, file)))}\n`);
  }
  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...BACKEND_FILES]);
  const client = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined });
  await client.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = client.signatureUrl(PACKAGE_OBJECT, { expires: 600 });
  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-credit-account-platform-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/actions/admin.js" "\$BACKUP/admin.js"
rollback() { code=\$?; if [ -f "\$BACKUP/admin.js" ]; then cp -a "\$BACKUP/admin.js" "\$APP/dist/src/actions/admin.js"; systemctl restart quizmate-api-shadow.service || true; fi; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-credit-account-platform.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-credit-account-platform.tar.gz -C "\$APP"
grep -q 'LEFT JOIN LATERAL' "\$APP/dist/src/actions/admin.js"
grep -q 'session_platform' "\$APP/dist/src/actions/admin.js"
grep -q 'INVALID_PLATFORM' "\$APP/dist/src/actions/admin.js"
if grep -rq 'redemption\\|oldUserBonus\\|OLD_USER_RECHARGE_BONUS\\|interviewWindowActions' "\$APP/dist/src/actions/admin.js"; then echo UNEXPECTED_PARALLEL_WORK_LEAKED; exit 1; fi
echo '--- deployed sha256 ---'
sha256sum "\$APP/dist/src/actions/admin.js"
echo '--- functional smoke (deployed artifact) ---'
node --input-type=module -e "
const m = await import('/opt/quizmate-api-shadow/dist/src/actions/admin.js');
const a = m.createAdminActions({ db: { query: async () => ({ rows: [{ count: '0' }], rowCount: 1 }), connect: async () => { throw new Error('no conn'); } }, config: {}, emailCodeSecret: 'x', registerBonusCredits: 0, sessionTtlDays: 30, sendVerificationCode: async () => undefined, runAnalysisModel: async () => ({ items: [] }), adminSecret: 'secret' });
try { await a.get('adminListCreditAccounts')({ adminSecret: 'secret', platform: 'ios-app' }, { requestId: 't', clientIp: '127.0.0.1', db: undefined }); console.log('REMOTE_INVALID_PLATFORM=NO'); }
catch (e) { console.log('REMOTE_INVALID_PLATFORM=' + (e.code === 'INVALID_PLATFORM')); }
"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
echo '--- remote API smoke ---'
curl -s -o /dev/null -w 'account_noauth_http=%{http_code}\\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{\"action\":\"adminListCreditAccounts\",\"platform\":\"win32-desktop\"}'
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_CREDIT_ACCOUNT_PLATFORM_OK`);
  if (!remote.includes('DEPLOY_CREDIT_ACCOUNT_PLATFORM_OK')) throw new Error('deployment marker missing');
}

async function main() {
  const auth = credentials();
  await deployBackend(auth);
  process.stdout.write('BACKEND_DEPLOY_DONE\n');
  process.stdout.write('ALL_DEPLOY_OK\n');
}

main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.message}\n`); process.exitCode = 1; });
