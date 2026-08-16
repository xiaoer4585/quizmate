const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const WEBSITE_FILE = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/credits.js');
const PACKAGE_FILE = path.resolve(__dirname, '../tmp/quizmate-api-referral-bonus-20260815.tar.gz');
const PACKAGE_OBJECT = 'deploy/quizmate-api-referral-bonus-20260815.tar.gz';
const WEBSITE_OBJECT = 'credits.js';

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}

function pctEncode(value) {
  return encodeURIComponent(value).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function sign(query, secret) {
  return crypto.createHmac('sha1', `${secret}&`).update(`GET&${pctEncode('/')}&${pctEncode(query)}`).digest('base64');
}

async function callEcs(auth, params) {
  const common = {
    Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak,
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(),
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
  const creditsFile = path.join(BACKEND_DIR, 'dist/src/domain/credits.js');
  const referralsFile = path.join(BACKEND_DIR, 'dist/src/actions/referrals.js');
  if (!fs.readFileSync(creditsFile, 'utf8').includes('REFERRAL_BONUS_CREDITS = 20')) throw new Error('compiled referral bonus is not 20');
  if (!fs.readFileSync(referralsFile, 'utf8').includes('${REFERRAL_BONUS_CREDITS}')) throw new Error('compiled referral share text is not dynamic');
  if (/60\s*积分|60积分/.test(fs.readFileSync(WEBSITE_FILE, 'utf8'))) throw new Error('website still contains 60-credit referral copy');

  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, 'dist/src/domain/credits.js', 'dist/src/actions/referrals.js']);
  const auth = credentials();
  const common = { region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined };
  const legacy = new OSS({ ...common, bucket: 'quizmate-vip' });
  const website = new OSS({ ...common, bucket: 'quizmate-cn' });
  await legacy.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = legacy.signatureUrl(PACKAGE_OBJECT, { expires: 600 });

  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=/opt/quizmate-api-shadow.rollback-referral-bonus-\$TS
rollback() {
  code=\$?
  if [ -d "\$BACKUP" ]; then
    cp -a "\$BACKUP/credits.js" "\$APP/dist/src/domain/credits.js"
    cp -a "\$BACKUP/referrals.js" "\$APP/dist/src/actions/referrals.js"
    systemctl restart quizmate-api-shadow.service || true
  fi
  echo AUTO_ROLLBACK_DONE
  exit \$code
}
trap rollback ERR
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/domain/credits.js" "\$BACKUP/credits.js"
cp -a "\$APP/dist/src/actions/referrals.js" "\$BACKUP/referrals.js"
curl -fsSL -o /tmp/quizmate-api-referral-bonus.tar.gz '${signedUrl}'
cd "\$APP"
tar -xzf /tmp/quizmate-api-referral-bonus.tar.gz
grep -q 'REFERRAL_BONUS_CREDITS = 20' dist/src/domain/credits.js
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_BACKEND_OK`);
  if (!remote.includes('DEPLOY_BACKEND_OK')) throw new Error('backend deployment marker missing');

  const previous = await website.get(WEBSITE_OBJECT);
  const backupObject = `rollback/CHG-20260815-01/credits-${new Date().toISOString().replace(/[:.]/g, '-')}.js`;
  await website.put(backupObject, previous.content, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
  await website.put(WEBSITE_OBJECT, WEBSITE_FILE, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
  const deployed = (await website.get(WEBSITE_OBJECT)).content.toString('utf8');
  if (!deployed.includes('双方各得 20 积分') || /60\s*积分|60积分/.test(deployed)) throw new Error('website verification failed');
  console.log(`WEBSITE_BACKUP=${backupObject}`);
  console.log('DEPLOY_WEBSITE_OK');
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAILED ${error.message}\n`);
  process.exitCode = 1;
});
