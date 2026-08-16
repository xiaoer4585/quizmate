const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const PKG_LOCAL = path.resolve(__dirname, '../tmp/quizmate-api-interview-answer-20260812.tar.gz');
const OSS_OBJECT = 'deploy/quizmate-api-interview-answer-20260812.tar.gz';

function loadCredentials() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile) throw new Error('Aliyun CLI profile not found');
  return {
    ak: profile.access_key_id,
    sk: profile.access_key_secret,
    token: profile.sts_token || ''
  };
}

function pctEncode(value) {
  return encodeURIComponent(value)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function sign(canonicalQuery, secret) {
  const source = `GET&${pctEncode('/')}&${pctEncode(canonicalQuery)}`;
  return crypto.createHmac('sha1', `${secret}&`).update(source).digest('base64');
}

async function callEcs(credentials, params) {
  const common = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: credentials.ak,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    RegionId: REGION,
    ...(credentials.token ? { SecurityToken: credentials.token } : {}),
    ...params
  };
  const keys = Object.keys(common).sort();
  const canonical = keys.map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`).join('&');
  const url = `https://ecs.${REGION}.aliyuncs.com/?${canonical}&Signature=${pctEncode(sign(canonical, credentials.sk))}`;
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runCommand(credentials, command) {
  const started = await callEcs(credentials, {
    Action: 'RunCommand',
    Type: 'RunShellScript',
    'InstanceId.1': INSTANCE_ID,
    CommandContent: command,
    Timeout: '300',
    ContentType: 'text/plain',
    EnableParameter: 'false',
    WorkingDir: '/root'
  });
  const invokeId = started.InvokeId;
  if (!invokeId) throw new Error(`No InvokeId: ${JSON.stringify(started)}`);
  process.stdout.write(`INVOKE_ID=${invokeId}\n`);

  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await callEcs(credentials, {
      Action: 'DescribeInvocations',
      InvokeId: invokeId
    });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;

    const result = await callEcs(credentials, {
      Action: 'DescribeInvocationResults',
      InvokeId: invokeId,
      InstanceId: INSTANCE_ID
    });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Remote deployment failed: ${status}, exit ${row?.ExitCode ?? 'unknown'}`);
    }
    return;
  }
  throw new Error('Remote deployment timed out');
}

async function main() {
  const speechFile = path.join(BACKEND_DIR, 'dist/src/actions/speech.js');
  const creditsFile = path.join(BACKEND_DIR, 'dist/src/domain/credits.js');
  if (!fs.readFileSync(speechFile, 'utf8').includes('generateInterviewAnswer')) {
    throw new Error('Compiled speech.js does not contain generateInterviewAnswer');
  }
  if (!fs.readFileSync(creditsFile, 'utf8').includes('CREDIT_COST_PER_INTERVIEW')) {
    throw new Error('Compiled credits.js does not contain CREDIT_COST_PER_INTERVIEW');
  }

  fs.mkdirSync(path.dirname(PKG_LOCAL), { recursive: true });
  execFileSync('tar', [
    '-czf', PKG_LOCAL,
    '-C', BACKEND_DIR,
    'dist/src/actions/speech.js',
    'dist/src/domain/credits.js'
  ]);

  const credentials = loadCredentials();
  const client = new OSS({
    endpoint: 'https://www.quizmate.vip',
    cname: true,
    bucket: 'quizmate-vip',
    secure: true,
    accessKeyId: credentials.ak,
    accessKeySecret: credentials.sk,
    stsToken: credentials.token || undefined,
    timeout: 120_000
  });
  await client.put(OSS_OBJECT, PKG_LOCAL, {
    headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' }
  });
  const signedUrl = client.signatureUrl(OSS_OBJECT, { expires: 600 });

  await runCommand(credentials, `set -e
TS=\$(date +%Y%m%d-%H%M%S)
cd /opt/quizmate-api-shadow
cp -a dist/src/actions/speech.js dist/src/actions/speech.js.rollback-interview-\$TS
cp -a dist/src/domain/credits.js dist/src/domain/credits.js.rollback-interview-\$TS
curl -sSL -o /tmp/quizmate-api-interview-answer.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-interview-answer.tar.gz
grep -q 'generateInterviewAnswer' dist/src/actions/speech.js
grep -q 'CREDIT_COST_PER_INTERVIEW' dist/src/domain/credits.js
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
echo DEPLOY_INTERVIEW_ANSWER_OK`);
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAILED ${error.message}\n`);
  process.exitCode = 1;
});
