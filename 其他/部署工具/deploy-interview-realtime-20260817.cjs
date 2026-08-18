const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const PACKAGE_FILE = path.resolve(__dirname, '../tmp/quizmate-api-interview-pricing-20260819.tar.gz');
const PACKAGE_OBJECT = 'deploy/quizmate-api-interview-pricing-20260819.tar.gz';

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}

function pctEncode(value) {
  return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function sign(query, secret) {
  return crypto.createHmac('sha1', `${secret}&`).update(`GET&${pctEncode('/')}&${pctEncode(query)}`).digest('base64');
}

async function callEcs(auth, params) {
  const common = {
    Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak,
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION,
    ...(auth.token ? { SecurityToken: auth.token } : {}), ...params,
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
    CommandContent: command, Timeout: '300', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root',
  });
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
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Remote deployment failed: ${status}, exit ${row?.ExitCode ?? 'unknown'}`);
    }
    return output;
  }
  throw new Error('Remote deployment timed out');
}

async function main() {
  const modelFile = path.join(BACKEND_DIR, 'dist/src/services/model.js');
  const speechFile = path.join(BACKEND_DIR, 'dist/src/actions/speech.js');
  const creditsFile = path.join(BACKEND_DIR, 'dist/src/domain/credits.js');
  const configurationFile = path.join(BACKEND_DIR, 'dist/src/actions/configuration.js');
  const compiledModel = fs.readFileSync(modelFile, 'utf8');
  if (!compiledModel.includes('INTERVIEW_SYSTEM_PROMPT') || !compiledModel.includes('isInterviewMode')) {
    throw new Error('compiled model.js lacks interview fast-model routing');
  }
  const { DEFAULT_INTERVIEW_PROMPT } = await import(pathToFileURL(configurationFile).href);
  if (!String(DEFAULT_INTERVIEW_PROMPT).includes('金字塔原理') || !String(DEFAULT_INTERVIEW_PROMPT).includes('1、2、3')) throw new Error('optimized interview prompt missing');
  if (!fs.readFileSync(speechFile, 'utf8').includes('CREDIT_COST_PER_INTERVIEW')) throw new Error('compiled speech action missing');
  if (!fs.readFileSync(creditsFile, 'utf8').includes('CREDIT_COST_PER_INTERVIEW')) throw new Error('compiled credits module missing');

  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR,
    'dist/src/services/model.js', 'dist/src/actions/speech.js', 'dist/src/actions/configuration.js', 'dist/src/domain/credits.js']);

  const auth = credentials();
  const client = new OSS({
    region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip',
    accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined,
  });
  await client.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = client.signatureUrl(PACKAGE_OBJECT, { expires: 600 });
  const promptBase64 = Buffer.from(DEFAULT_INTERVIEW_PROMPT, 'utf8').toString('base64');

  const output = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-interview-pricing-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/services/model.js" "\$BACKUP/model.js"
cp -a "\$APP/dist/src/actions/speech.js" "\$BACKUP/speech.js"
cp -a "\$APP/dist/src/actions/configuration.js" "\$BACKUP/configuration.js"
cp -a "\$APP/dist/src/domain/credits.js" "\$BACKUP/credits.js"
sha256sum "\$APP/dist/src/services/model.js" | awk '{print "BEFORE_MODEL_SHA256="\$1}'
set -a
. /etc/quizmate-api-shadow.env
set +a
cat > /tmp/quizmate-interview-prompt.mjs <<'NODE'
import fs from 'node:fs';
const [mode, file] = process.argv.slice(2);
const call = async (action, extra = {}) => {
  const response = await fetch('http://127.0.0.1:8200/study-auth-api', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, adminSecret: process.env.ADMIN_SECRET, ...extra })
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error(result.error || action + ' failed');
  return result.data;
};
if (mode === 'backup') {
  const data = await call('adminGetInterviewPromptConfig');
  fs.writeFileSync(file, String(data.prompt || ''), 'utf8');
  console.log('PROMPT_BACKUP_LENGTH=' + String(data.prompt || '').length);
} else {
  const prompt = mode === 'restore' ? fs.readFileSync(file, 'utf8') : Buffer.from(process.env.PROMPT_B64, 'base64').toString('utf8');
  const data = await call('adminSetInterviewPromptConfig', { prompt });
  console.log('PROMPT_LENGTH=' + String(data.prompt || '').length);
}
NODE
node /tmp/quizmate-interview-prompt.mjs backup "\$BACKUP/interview-prompt.txt"
rollback() {
  code=\$?
  cp -a "\$BACKUP/model.js" "\$APP/dist/src/services/model.js" || true
  cp -a "\$BACKUP/speech.js" "\$APP/dist/src/actions/speech.js" || true
  cp -a "\$BACKUP/configuration.js" "\$APP/dist/src/actions/configuration.js" || true
  cp -a "\$BACKUP/credits.js" "\$APP/dist/src/domain/credits.js" || true
  systemctl restart quizmate-api-shadow.service || true
  node /tmp/quizmate-interview-prompt.mjs restore "\$BACKUP/interview-prompt.txt" || true
  echo AUTO_ROLLBACK_DONE
  exit \$code
}
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-interview-pricing.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-interview-pricing.tar.gz -C "\$APP"
grep -q 'INTERVIEW_SYSTEM_PROMPT' "\$APP/dist/src/services/model.js"
grep -q 'isInterviewMode' "\$APP/dist/src/services/model.js"
grep -q 'CREDIT_COST_PER_INTERVIEW' "\$APP/dist/src/domain/credits.js"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
export PROMPT_B64='${promptBase64}'
node /tmp/quizmate-interview-prompt.mjs apply "\$BACKUP/interview-prompt.txt"
sha256sum "\$APP/dist/src/services/model.js" | awk '{print "AFTER_MODEL_SHA256="\$1}'
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_INTERVIEW_REALTIME_OK`);

  if (!output.includes('DEPLOY_INTERVIEW_REALTIME_OK')) throw new Error('deployment marker missing');
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAILED ${error.message}\n`);
  process.exitCode = 1;
});
