// CHG-20260821-05 后端部署：模型解析失败自动重试一次（仅改动 dist/src/services/model.js，无迁移）
// 流程：本地 dist 标记自检 -> 打包 tar.gz -> 上传 OSS -> 云助手执行备份/覆盖/重启/校验/冒烟
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260821-05-MODEL-RETRY';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;

const BACKEND_FILES = [
  'dist/src/services/model.js',
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
  // 校验编译产物包含本次功能标记
  const checks = [
    ['dist/src/services/model.js', ['STRICT_JSON_RETRY_HINT', 'retrying once with strict JSON instruction', 'escapeRawControlChars']],
  ];
  for (const [file, markers] of checks) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of markers) {
      if (!content.includes(marker)) throw new Error(`${file} lacks marker ${marker}`);
    }
  }
  // 不应夹带未发布的并行改动
  const mustNotContain = ['redemption', 'oldUserBonus', 'OLD_USER_RECHARGE_BONUS', 'credit_log_whitelist', 'session_platform'];
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
  // 冒烟脚本用 base64 传递，避免模板字符串/shell 双层转义撕裂 JSON 引号
  const smokeScript = `import { parseModelResult } from '/opt/quizmate-api-shadow/dist/src/services/model.js';
const raw = '{"items":[{"summary":"题目1","answer":"B","explanation":"选项B正确。\\n原因：\\t直接套用公式。"}]}';
const r1 = parseModelResult(raw);
console.log('REMOTE_RAW_CTRL_REPAIR=' + String(r1.items[0].explanation.includes('直接套用公式')));
let code = '';
try { parseModelResult('{"items":[{"answer":"我认为"Redis"很快"}]}'); } catch (e) { code = e.code || ''; }
console.log('REMOTE_INVALID_JSON_502=' + String(code === 'INVALID_MODEL_RESULT'));
const r3 = parseModelResult('{"items":[{"summary":"题目1","answer":"B"}],"note":"ok"}');
console.log('REMOTE_VALID_JSON_OK=' + String(r3.items[0].answer === 'B' && r3.note === 'ok'));
`;
  const smokeB64 = Buffer.from(smokeScript, 'utf8').toString('base64');
  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-model-retry-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/services/model.js" "\$BACKUP/model.js"
rollback() { code=\$?; if [ -f "\$BACKUP/model.js" ]; then cp -a "\$BACKUP/model.js" "\$APP/dist/src/services/model.js"; systemctl restart quizmate-api-shadow.service || true; fi; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-model-retry.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-model-retry.tar.gz -C "\$APP"
grep -q 'STRICT_JSON_RETRY_HINT' "\$APP/dist/src/services/model.js"
grep -q 'retrying once with strict JSON instruction' "\$APP/dist/src/services/model.js"
grep -q 'escapeRawControlChars' "\$APP/dist/src/services/model.js"
echo '--- deployed sha256 ---'
sha256sum "\$APP/dist/src/services/model.js"
echo '--- functional smoke (deployed artifact) ---'
echo '${smokeB64}' | base64 -d > /tmp/model-retry-smoke.mjs
node /tmp/model-retry-smoke.mjs
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
echo '--- remote API smoke ---'
curl -s -o /dev/null -w 'unknown_action_http=%{http_code}\\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{"action":"definitelyNoSuchAction"}'
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_MODEL_RETRY_OK`);
  if (!remote.includes('DEPLOY_MODEL_RETRY_OK')) throw new Error('deployment marker missing');
  for (const line of ['REMOTE_RAW_CTRL_REPAIR=true', 'REMOTE_INVALID_JSON_502=true', 'REMOTE_VALID_JSON_OK=true']) {
    if (!remote.includes(line)) throw new Error(`smoke missing ${line}`);
  }
}

async function main() {
  const auth = credentials();
  await deployBackend(auth);
  process.stdout.write('BACKEND_DEPLOY_DONE\n');
  process.stdout.write('ALL_DEPLOY_OK\n');
}

main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.message}\n`); process.exitCode = 1; });
