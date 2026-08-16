// 在 ECS 上本地调用 adminListDomainInquiries 验证后台查询
const { execFileSync } = require('child_process');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';

function aliyunCli(args) { return execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
function aliyunCliJson(args) { return JSON.parse(aliyunCli(args)); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runCommand(commandContent) {
  const run = aliyunCliJson(['ecs', 'RunCommand', '--RegionId', REGION, '--Type', 'RunShellScript', '--InstanceId.1', INSTANCE_ID, '--CommandContent', commandContent, '--Timeout', '60', '--EnableParameter', 'false', '--WorkingDir', '/root']);
  const invokeId = run.InvokeId;
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
  if (r && r.Output) process.stdout.write(Buffer.from(r.Output, 'base64').toString('utf8'));
}

async function main() {
  // 在 ECS 上用 ADMIN_SECRET 调用 adminListDomainInquiries
  const cmd = `set -a; . /etc/quizmate-api-shadow.env; set +a
echo "=== Test adminListDomainInquiries ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api \\
  -H "Content-Type: application/json" \\
  -d "{\\"action\\":\\"adminListDomainInquiries\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"page\\":1,\\"pageSize\\":10}" | python3 -m json.tool 2>/dev/null || \\
curl -s -X POST http://127.0.0.1:8200/study-auth-api \\
  -H "Content-Type: application/json" \\
  -d "{\\"action\\":\\"adminListDomainInquiries\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"page\\":1,\\"pageSize\\":10}"`;
  await runCommand(cmd);
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
