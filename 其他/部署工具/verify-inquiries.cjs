// 验证数据库中的询价数据 + 获取 ADMIN_SECRET 用于后续测试
const { execFileSync } = require('child_process');
const fs = require('fs');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';

function aliyunCli(args) {
  return execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function aliyunCliJson(args) {
  return JSON.parse(aliyunCli(args));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runCommand(commandContent) {
  const run = aliyunCliJson([
    'ecs', 'RunCommand',
    '--RegionId', REGION,
    '--Type', 'RunShellScript',
    '--InstanceId.1', INSTANCE_ID,
    '--CommandContent', commandContent,
    '--Timeout', '60',
    '--EnableParameter', 'false',
    '--WorkingDir', '/root'
  ]);
  const invokeId = run.InvokeId;
  if (!invokeId) throw new Error('No InvokeId: ' + JSON.stringify(run));
  process.stdout.write(`INVOKE_ID=${invokeId}\n`);
  const deadline = Date.now() + 90 * 1000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const inv = aliyunCliJson(['ecs', 'DescribeInvocations', '--RegionId', REGION, '--InvokeId', invokeId]);
    const invItem = inv.Invocations && inv.Invocations.Invocation && inv.Invocations.Invocation[0];
    if (!invItem) continue;
    const inst = invItem.InvokeInstances && invItem.InvokeInstances.InvokeInstance && invItem.InvokeInstances.InvokeInstance[0];
    const st = inst && inst.InstanceInvokeStatus;
    if (st && st !== 'Running' && st !== 'Pending') break;
  }
  const det = aliyunCliJson(['ecs', 'DescribeInvocationResults', '--RegionId', REGION, '--InvokeId', invokeId, '--InstanceId', INSTANCE_ID]);
  const r = det.Invocation && det.Invocation.InvocationResults && det.Invocation.InvocationResults.InvocationResult && det.Invocation.InvocationResults.InvocationResult[0];
  if (r && r.Output) {
    process.stdout.write(Buffer.from(r.Output, 'base64').toString('utf8'));
  }
}

async function main() {
  const cmd = `set -a; . /etc/quizmate-api-shadow.env; set +a
echo "=== ADMIN_SECRET suffix ==="
echo "\${ADMIN_SECRET: -8}"
echo "=== domain_inquiries data ==="
psql "\$DATABASE_URL" -c "SELECT id, domain, name, phone, email, offer, message, created_at FROM domain_inquiries ORDER BY id;"
echo "=== CORS_ORIGINS ==="
grep '^CORS_ORIGINS=' /etc/quizmate-api-shadow.env`;
  await runCommand(cmd);
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
