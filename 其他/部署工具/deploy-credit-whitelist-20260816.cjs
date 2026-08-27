// CHG-20260816-05 后端部署：积分流水白名单（admin.ts + 010 迁移）
// 流程：上传包到 OSS + 签名URL + aliyun CLI 云助手部署（备份 release 与数据库 -> 覆盖 -> migrate -> 重启 -> 健康检查 -> 校验）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PKG_LOCAL = path.resolve(__dirname, '../tmp/quizmate-api-chg20260816-05.tar.gz');
const OSS_OBJECT = 'deploy/quizmate-api-chg20260816-05.tar.gz';
const SCRIPT_FILE = path.resolve(__dirname, '../tmp/deploy-chg20260816-05.sh');

function loadAliyunAk() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  if (!profile || profile.mode !== 'AK' || !profile.access_key_id || !profile.access_key_secret) {
    throw new Error('aliyun CLI 配置中未找到有效的 AK 凭证');
  }
  return { id: profile.access_key_id, secret: profile.access_key_secret };
}

function aliyunCli(args) {
  const out = execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  return out.trim();
}

function aliyunCliJson(args) {
  const out = aliyunCli(args);
  try { return JSON.parse(out); } catch { throw new Error('aliyun CLI 非 JSON 输出: ' + out.slice(0, 500)); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runCommand(commandFile) {
  const commandContent = fs.readFileSync(commandFile, 'utf8');
  const run = aliyunCliJson([
    'ecs', 'RunCommand',
    '--RegionId', REGION,
    '--Type', 'RunShellScript',
    '--InstanceId.1', INSTANCE_ID,
    '--CommandContent', commandContent,
    '--Timeout', '300',
    '--EnableParameter', 'false',
    '--WorkingDir', '/root'
  ]);
  const invokeId = run.InvokeId;
  if (!invokeId) throw new Error('No InvokeId: ' + JSON.stringify(run));
  process.stdout.write(`INVOKE_ID=${invokeId}\n`);
  const deadline = Date.now() + 420 * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const inv = aliyunCliJson(['ecs', 'DescribeInvocations', '--RegionId', REGION, '--InvokeId', invokeId]);
    const invItem = inv.Invocations && inv.Invocations.Invocation && inv.Invocations.Invocation[0];
    if (!invItem) continue;
    const inst = invItem.InvokeInstances && invItem.InvokeInstances.InvokeInstance && invItem.InvokeInstances.InvokeInstance[0];
    const st = inst && inst.InstanceInvokeStatus;
    if (st && st !== 'Running' && st !== 'Pending') break;
    if (invItem.InvokeStatus && invItem.InvokeStatus !== 'Running' && invItem.InvokeStatus !== 'Pending') break;
  }
  const det = aliyunCliJson(['ecs', 'DescribeInvocationResults', '--RegionId', REGION, '--InvokeId', invokeId, '--InstanceId', INSTANCE_ID]);
  const r = det.Invocation && det.Invocation.InvocationResults && det.Invocation.InvocationResults.InvocationResult && det.Invocation.InvocationResults.InvocationResult[0];
  if (!r) { process.stdout.write('NO_RESULT\n'); process.exitCode = 3; return; }
  process.stdout.write(`STATUS=${r.InvokeStatus || 'Unknown'} EXITCODE=${r.ExitCode ?? 'null'}\n`);
  if (r.Output) {
    process.stdout.write('---OUTPUT---\n' + Buffer.from(r.Output, 'base64').toString('utf8') + '\n---END---\n');
  }
  if (r.ErrorInfo) process.stderr.write('ERR: ' + r.ErrorInfo + '\n');
  if (r.InvokeStatus === 'Failed' || (r.ExitCode != null && r.ExitCode !== 0)) process.exitCode = 2;
}

async function main() {
  if (!fs.existsSync(PKG_LOCAL)) throw new Error('package not found: ' + PKG_LOCAL);
  const AK = loadAliyunAk();
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: AK.id, accessKeySecret: AK.secret, timeout: 120_000 });
  const putResult = await client.put(OSS_OBJECT, PKG_LOCAL);
  if (putResult.res.status !== 200) throw new Error('OSS put failed: ' + putResult.res.status);
  process.stdout.write('OSS_UPLOAD_OK ' + OSS_OBJECT + ' ' + fs.statSync(PKG_LOCAL).size + ' bytes\n');
  const signUrl = client.signatureUrl(OSS_OBJECT, { expires: 600 });
  process.stdout.write('SIGN_URL=' + signUrl.slice(0, 100) + '...\n');
  const deployCmd = `set -e
TS=\$(date +%Y%m%d-%H%M%S)
echo "=== STEP 1: download package ==="
cd /tmp
curl -sSL -o quizmate-api-chg20260816-05.tar.gz '${signUrl}'
ls -lh quizmate-api-chg20260816-05.tar.gz
echo "=== STEP 2: backup current release ==="
cp -a /opt/quizmate-api-shadow /opt/quizmate-api-shadow.rollback-chg20260816-05-\$TS
echo BACKUP_RELEASE_OK
echo "=== STEP 3: backup database ==="
set -a; . /etc/quizmate-api-shadow.env; set +a
mkdir -p /tmp/quizmate-deploy/chg20260816-05
pg_dump --format=custom --file=/tmp/quizmate-deploy/chg20260816-05/quizmate-\$TS.dump "\$DATABASE_URL"
ls -lh /tmp/quizmate-deploy/chg20260816-05/
echo PG_DUMP_OK
echo "=== STEP 4: extract & overlay files ==="
cd /opt/quizmate-api-shadow
tar -xzf /tmp/quizmate-api-chg20260816-05.tar.gz
echo EXTRACT_OK
ls -la dist/src/actions/admin.js migrations/010_credit_log_whitelist.sql
echo "=== STEP 5: run migration ==="
cd /opt/quizmate-api-shadow
node_modules/.bin/tsx scripts/migrate.ts 2>&1 | tail -20
echo MIGRATE_DONE
echo "=== STEP 6: restart service ==="
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
echo "=== STEP 7: health check ==="
curl -s -o /dev/null -w 'health_http=%{http_code}' http://127.0.0.1:8200/health
echo
echo "=== STEP 8: verify new code ==="
grep -c 'credit_log_whitelist' dist/src/actions/admin.js
grep -c 'adminGetCreditWhitelist' dist/src/actions/admin.js
echo "=== STEP 9: schema check ==="
psql "\$DATABASE_URL" -c "SELECT version FROM schema_migrations ORDER BY version;" 2>&1 | tail -12
psql "\$DATABASE_URL" -c "\\d credit_log_whitelist" 2>&1 | head -12
echo "=== STEP 10: local API smoke (no creds must fail auth) ==="
curl -s -o /dev/null -w 'whitelist_noauth_http=%{http_code}' -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d '{"action":"adminGetCreditWhitelist"}'
echo
echo DEPLOY_ALL_DONE`;
  fs.writeFileSync(SCRIPT_FILE, deployCmd, 'utf8');
  process.stdout.write('SCRIPT_WRITTEN: ' + SCRIPT_FILE + '\n');
  await runCommand(SCRIPT_FILE);
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
