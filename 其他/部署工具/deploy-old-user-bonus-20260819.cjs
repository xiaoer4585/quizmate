// CHG-20260819 老用户充值额外赠送50积分 + 套餐名称改为笔面试前缀
// 部署范围：官网(quizmate-cn)、后端(ECS quizmate-api-shadow)、管理后台(quizmate-vip cname)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260819-OLD-USER-BONUS';
const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;

// 本次部署的后端编译产物
const BACKEND_FILES = [
  'dist/src/domain/credits.js',
  'dist/src/actions/accounts.js',
  'dist/src/actions/payments.js',
  'dist/src/payments/settlement.js',
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

function pctEncode(value) { return encodeURIComponent(value).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A'); }
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

async function deployWebsite(auth) {
  const client = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-cn', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120_000 });
  const files = [
    ['recharge.html', 'text/html; charset=utf-8'],
    ['credits.js', 'application/javascript; charset=utf-8'],
  ];
  // 备份线上版本用于回滚
  for (const [objectName] of files) {
    const backupName = `rollback/${CHANGE_ID}/${objectName}`;
    await client.copy(backupName, objectName);
    const backupHead = await client.head(backupName);
    process.stdout.write(`BACKUP_OK ${backupName} ${backupHead.res.headers['content-length']} bytes\n`);
  }
  // 上传并校验
  const localHtml = fs.readFileSync(path.join(SITE_ROOT, 'recharge.html'), 'utf8');
  if (!localHtml.includes('data-old-user-bonus')) throw new Error('local recharge.html lacks old-user bonus banner');
  const localJs = fs.readFileSync(path.join(SITE_ROOT, 'credits.js'), 'utf8');
  if (!localJs.includes('oldUserBonus')) throw new Error('local credits.js lacks oldUserBonus logic');
  for (const [objectName, contentType] of files) {
    const localPath = path.join(SITE_ROOT, objectName);
    const local = fs.readFileSync(localPath);
    await client.put(objectName, localPath, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
    const remote = await client.get(objectName);
    if (sha256(remote.content) !== sha256(local)) throw new Error(`Hash mismatch: ${objectName}`);
    process.stdout.write(`UPLOAD_VERIFY_OK ${objectName} ${local.length} bytes\n`);
  }
}

async function deployBackend(auth) {
  // 校验编译产物包含本次功能标记
  const checks = [
    ['dist/src/domain/credits.js', ['OLD_USER_RECHARGE_BONUS', '笔面试体验包']],
    ['dist/src/actions/accounts.js', ['isOldUser']],
    ['dist/src/actions/payments.js', ['oldUserBonus']],
    ['dist/src/payments/settlement.js', ['old_user_bonus']],
  ];
  for (const [file, markers] of checks) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of markers) {
      if (!content.includes(marker)) throw new Error(`${file} lacks marker ${marker}`);
    }
  }
  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...BACKEND_FILES]);
  const client = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined });
  await client.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = client.signatureUrl(PACKAGE_OBJECT, { expires: 600 });
  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-old-user-bonus-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/domain/credits.js" "\$BACKUP/credits.js"
cp -a "\$APP/dist/src/actions/accounts.js" "\$BACKUP/accounts.js"
cp -a "\$APP/dist/src/actions/payments.js" "\$BACKUP/payments.js"
cp -a "\$APP/dist/src/payments/settlement.js" "\$BACKUP/settlement.js"
cp -a "\$APP/dist/src/services/model.js" "\$BACKUP/model.js"
rollback() { code=\$?; if [ -f "\$BACKUP/credits.js" ]; then cp -a "\$BACKUP/credits.js" "\$APP/dist/src/domain/credits.js"; cp -a "\$BACKUP/accounts.js" "\$APP/dist/src/actions/accounts.js"; cp -a "\$BACKUP/payments.js" "\$APP/dist/src/actions/payments.js"; cp -a "\$BACKUP/settlement.js" "\$APP/dist/src/payments/settlement.js"; cp -a "\$BACKUP/model.js" "\$APP/dist/src/services/model.js"; systemctl restart quizmate-api-shadow.service || true; fi; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-old-user-bonus.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-old-user-bonus.tar.gz -C "\$APP"
grep -q 'OLD_USER_RECHARGE_BONUS' "\$APP/dist/src/domain/credits.js"
grep -q 'isOldUser' "\$APP/dist/src/actions/accounts.js"
grep -q 'oldUserBonus' "\$APP/dist/src/actions/payments.js"
grep -q 'old_user_bonus' "\$APP/dist/src/payments/settlement.js"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_OLD_USER_BONUS_OK`);
  if (!remote.includes('DEPLOY_OLD_USER_BONUS_OK')) throw new Error('deployment marker missing');
}

async function deployAdminWeb(auth) {
  const localPath = path.join(SITE_ROOT, 'admin-web/index.html');
  const html = fs.readFileSync(localPath, 'utf8');
  if (!html.includes('笔面试体验包')) throw new Error('admin-web lacks updated package names');
  // 部署前语法校验：内联脚本必须能通过 node 语法解析
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const appScript = inlineScripts[inlineScripts.length - 1];
  if (appScript) {
    try { new (require('vm').Script)(appScript, { filename: 'admin-web-inline.js' }); }
    catch (e) { throw new Error('admin-web inline script syntax error: ' + e.message); }
  }
  // bucket quizmate-vip 绑定了 CNAME www.quizmate.vip，必须用 cname 方式
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 120_000 });
  const previous = await client.get('admin-web/index.html');
  await client.put(`rollback/${CHANGE_ID}/admin-web.index.html`, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  process.stdout.write('ADMIN_WEB_BACKUP_OK\n');
  await client.put('admin-web/index.html', localPath, { headers: { 'Cache-Control': 'no-cache' } });
  const verify = await client.get('admin-web/index.html');
  if (sha256(verify.content) !== sha256(fs.readFileSync(localPath))) throw new Error('admin-web hash mismatch');
  process.stdout.write('ADMIN_WEB_UPLOAD_OK\n');
}

async function main() {
  const auth = credentials();
  await deployWebsite(auth);
  process.stdout.write('WEBSITE_DEPLOY_DONE\n');
  await deployBackend(auth);
  process.stdout.write('BACKEND_DEPLOY_DONE\n');
  await deployAdminWeb(auth);
  process.stdout.write('ADMIN_WEB_DEPLOY_DONE\n');
  process.stdout.write('ALL_DEPLOY_OK\n');
}

main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.message}\n`); process.exitCode = 1; });
