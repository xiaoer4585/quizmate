// CHG-20260824-REFERRAL-CHAIN: referral bonus refresh, 5% commission, cumulative total and website copy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260824-REFERRAL-CHAIN';
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const backendRoot = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const packageFile = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const packageObject = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;
const websiteOnly = process.argv.includes('--website-only');
const backendFiles = [
  'dist/src/domain/credits.js',
  'dist/src/actions/referrals.js',
  'dist/src/actions/analysis.js',
  'dist/src/actions/speech.js',
  'dist/src/payments/settlement.js',
  'dist/src/services/model-failure-context.js',
  'dist/src/server.js',
  'migrations/012_referral_tiered_bonus.sql',
  'migrations/013_referral_tiered_grants.sql'
];

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}

function pctEncode(value) {
  return encodeURIComponent(value)
    .replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28')
    .replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E');
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

function verifyLocalArtifacts() {
  const markers = [
    ['dist/src/domain/credits.js', ['REFERRAL_COMMISSION_RATE = 0.05', 'REFERRAL_BONUS_CREDITS = 20']],
    ['dist/src/actions/referrals.js', ['totalAmount', 'creditBalance', "status IN ('registered','activated','rewarded')"]],
    ['dist/src/actions/analysis.js', ['referralCreditBalance', 'model-failure-context.js']],
    ['dist/src/actions/speech.js', ['model-failure-context.js']],
    ['dist/src/payments/settlement.js', ['paymentSettlementInternals', 'credits_granted', "status IN ('registered','activated','rewarded')"]],
    ['dist/src/services/model-failure-context.js', ['setModelFailureContext', 'getModelFailureContext']],
    ['dist/src/server.js', ['getModelFailureContext']],
    ['migrations/012_referral_tiered_bonus.sql', ['invited_recharged_count', 'credits_granted']],
    ['migrations/013_referral_tiered_grants.sql', ['ALTER TABLE referral_tiered_grants', 'credits_granted']]
  ];
  for (const [file, expected] of markers) {
    const content = fs.readFileSync(path.join(backendRoot, file), 'utf8');
    for (const marker of expected) if (!content.includes(marker)) throw new Error(`${file} lacks marker: ${marker}`);
  }
  const website = fs.readFileSync(path.join(siteRoot, 'credits.js'), 'utf8');
  for (const marker of ['提成总额', '邀请好友充值，邀请人拿 <b>5%</b> 提成', 'commission.totalAmount', 'data.creditBalance']) {
    if (!website.includes(marker)) throw new Error(`credits.js lacks marker: ${marker}`);
  }
}

async function deployBackend(auth, signedUrl) {
  const fileList = backendFiles.filter((file) => file.startsWith('dist/')).join(' ');
  const existingFileList = backendFiles
    .filter((file) => file.startsWith('dist/') && file !== 'dist/src/services/model-failure-context.js')
    .join(' ');
  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=/opt/quizmate-api-shadow.rollback-referral-chain-\$TS
STAGE=\$(mktemp -d /tmp/quizmate-referral-chain.XXXXXX)
mkdir -p "\$BACKUP"
tar -czf "\$BACKUP/app-files.tar.gz" -C "\$APP" ${existingFileList}
set -a
. /etc/quizmate-api-shadow.env
set +a
pg_dump --format=custom --file="\$BACKUP/database.dump" "\$DATABASE_URL"
rollback() {
  code=\$?
  rm -f "\$APP/dist/src/services/model-failure-context.js"
  tar -xzf "\$BACKUP/app-files.tar.gz" -C "\$APP" || true
  systemctl restart quizmate-api-shadow.service || true
  echo AUTO_ROLLBACK_DONE
  exit \$code
}
trap rollback ERR
curl -fsSL -o "\$STAGE/package.tar.gz" '${signedUrl}'
tar -xzf "\$STAGE/package.tar.gz" -C "\$STAGE"
apply_migration() {
  file=\$1
  exists=\$(psql "\$DATABASE_URL" -X -A -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version='\$file'")
  if [ "\$exists" = "0" ]; then
    psql "\$DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 -f "\$STAGE/migrations/\$file" -c "INSERT INTO schema_migrations(version) VALUES ('\$file')"
  fi
}
apply_migration 012_referral_tiered_bonus.sql
apply_migration 013_referral_tiered_grants.sql
for file in ${fileList}; do
  cp -a "\$STAGE/\$file" "\$APP/\$file"
done
grep -q 'REFERRAL_COMMISSION_RATE = 0.05' "\$APP/dist/src/domain/credits.js"
grep -q 'paymentSettlementInternals' "\$APP/dist/src/payments/settlement.js"
grep -q 'referralCreditBalance' "\$APP/dist/src/actions/analysis.js"
grep -q 'totalAmount' "\$APP/dist/src/actions/referrals.js"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
node --input-type=module -e "const c=await import('/opt/quizmate-api-shadow/dist/src/domain/credits.js'); if(c.REFERRAL_COMMISSION_RATE!==0.05||c.REFERRAL_BONUS_CREDITS!==20) process.exit(1); console.log('RULES_OK rate='+c.REFERRAL_COMMISSION_RATE+' bonus='+c.REFERRAL_BONUS_CREDITS)"
psql "\$DATABASE_URL" -X -A -t -c "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='referral_tiered_grants'"
psql "\$DATABASE_URL" -X -A -t -c "SELECT version FROM schema_migrations WHERE version IN ('012_referral_tiered_bonus.sql','013_referral_tiered_grants.sql') ORDER BY version"
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_REFERRAL_BACKEND_OK`);
  if (!remote.includes('DEPLOY_REFERRAL_BACKEND_OK')) throw new Error('Backend deployment marker missing');
}

async function deployWebsite(auth) {
  const localFile = path.join(siteRoot, 'credits.js');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targets = [
    { bucket:'quizmate-vip', domain:'https://www.quizmate.vip' },
    { bucket:'quizmate-cn', domain:'https://quizmate.cn' }
  ].map((target) => ({
    ...target,
    client: new OSS({
      region: REGION,
      endpoint: 'https://oss-cn-beijing.aliyuncs.com',
      secure: true,
      bucket: target.bucket,
      accessKeyId: auth.ak,
      accessKeySecret: auth.sk,
      stsToken: auth.token || undefined
    })
  }));
  const backups = [];
  try {
    for (const target of targets) {
      const previous = await target.client.get('credits.js');
      const backupObject = `rollback/${CHANGE_ID}/${target.bucket}-credits-${stamp}.js`;
      await target.client.put(backupObject, previous.content, {
        headers: { 'Content-Type':'application/javascript; charset=utf-8' }
      });
      backups.push({ target, previous, backupObject });
      await target.client.put('credits.js', localFile, {
        headers: { 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-cache' }
      });
      const deployed = (await target.client.get('credits.js')).content.toString('utf8');
      for (const marker of ['提成总额', '邀请好友充值，邀请人拿 <b>5%</b> 提成', 'commission.totalAmount', 'data.creditBalance']) {
        if (!deployed.includes(marker)) throw new Error(`${target.bucket}/credits.js lacks marker: ${marker}`);
      }
    }
    for (const target of targets) {
      const publicResponse = await fetch(`${target.domain}/credits.js?v=${Date.now()}`, { cache:'no-store' });
      const publicText = await publicResponse.text();
      if (!publicResponse.ok || !publicText.includes('邀请好友充值，邀请人拿 <b>5%</b> 提成')) {
        throw new Error(`${target.domain} verification failed: HTTP ${publicResponse.status}`);
      }
      process.stdout.write(`PUBLIC_WEBSITE_OK ${target.domain}\n`);
    }
  } catch (error) {
    for (const backup of backups) {
      await backup.target.client.put('credits.js', backup.previous.content, {
        headers: { 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-cache' }
      });
    }
    throw error;
  }
  for (const backup of backups) process.stdout.write(`WEBSITE_BACKUP=${backup.backupObject}\n`);
  process.stdout.write('DEPLOY_REFERRAL_WEBSITE_OK\n');
}

async function verifyPublicApi() {
  const response = await fetch('https://api.quizmate.vip/study-auth-api', {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ action:'getCreditConfig' })
  });
  const data = await response.json();
  if (!response.ok || !data.ok || !Array.isArray(data.data?.packages)) throw new Error('Public API smoke failed');
  process.stdout.write(`PUBLIC_API_OK packages=${data.data.packages.length}\n`);
}

async function main() {
  verifyLocalArtifacts();
  const auth = credentials();
  if (!websiteOnly) {
    fs.mkdirSync(path.dirname(packageFile), { recursive:true });
    execFileSync('tar', ['-czf', packageFile, '-C', backendRoot, ...backendFiles]);
    const packageClient = new OSS({
      region:REGION, endpoint:'https://oss-cn-beijing.aliyuncs.com', secure:true, bucket:'quizmate-vip',
      accessKeyId:auth.ak, accessKeySecret:auth.sk, stsToken:auth.token || undefined
    });
    await packageClient.put(packageObject, packageFile, { headers:{ 'Content-Type':'application/gzip', 'Cache-Control':'no-cache' } });
    await deployBackend(auth, packageClient.signatureUrl(packageObject, { expires:600 }));
  }
  await verifyPublicApi();
  await deployWebsite(auth);
  process.stdout.write('DEPLOY_REFERRAL_CHAIN_DONE\n');
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAILED ${error.message}\n`);
  process.exitCode = 1;
});
