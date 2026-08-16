// 阿里云 ECS 云助手（RunCommand/DescribeInvocationResults）通用执行器
// 用法: node aliyun-ecs-run.cjs "<shell 命令>" [timeoutSeconds]
const crypto = require('crypto');

const AK_ID = process.env.OSS_AK_ID;
const AK_SECRET = process.env.OSS_AK_SECRET;
const INSTANCE_ID = process.env.ECS_INSTANCE_ID || 'i-2zedgehm045w1gsarawx';
const REGION = process.env.ECS_REGION || 'cn-beijing';
if (!AK_ID || !AK_SECRET) throw new Error('OSS_AK_ID/OSS_AK_SECRET env required');
const command = process.argv[2];
const timeoutSec = 300; // 固定 300，避免小值被 API 拒绝
if (!command) throw new Error('command arg required');

function pctEncode(s) {
  return encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}
function sign(method, canonicalQuery, secret) {
  return crypto.createHmac('sha1', secret + '&').update(method + '&' + pctEncode('/') + '&' + pctEncode(canonicalQuery)).digest('base64');
}
async function callEcs(params, region = REGION) {
  const common = {
    Format: 'JSON', Version: '2014-05-26', AccessKeyId: AK_ID,
    SignatureMethod: 'HMAC-SHA1', Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), RegionId: region, ...params,
  };
  const keys = Object.keys(common).sort();
  const canonical = keys.map((k) => pctEncode(k) + '=' + pctEncode(common[k])).join('&');
  const signature = sign('GET', canonical, AK_SECRET);
  const url = `https://ecs.${region}.aliyuncs.com/?${keys.map((k) => pctEncode(k) + '=' + pctEncode(common[k])).join('&')}&Signature=${pctEncode(signature)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`ECS API ${res.status}: ${text}`);
  return JSON.parse(text);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  // 1. 触发 RunCommand（InstanceId 是 List 参数，需展开为 InstanceId.1=xxx）
  const run = await callEcs({
    Action: 'RunCommand',
    RegionId: REGION,
    Type: 'RunShellScript',
    'InstanceId.1': INSTANCE_ID,
    CommandContent: command,
    Timeout: String(timeoutSec),
    ContentType: 'text/plain',
    EnableParameter: 'false',
    WorkingDir: '/root',
  });
  const invokeId = run.InvokeId;
  if (!invokeId) throw new Error('No InvokeId returned: ' + JSON.stringify(run));
  process.stdout.write(`INVOKE_ID=${invokeId}\n`);

  // 2. 轮询 DescribeInvocations 直到完成
  const deadline = Date.now() + (timeoutSec + 120) * 1000;
  let finalResult = null;
  while (Date.now() < deadline) {
    await sleep(2500);
    const inv = await callEcs({ Action: 'DescribeInvocations', RegionId: REGION, InvokeId: invokeId });
    const invItem = inv.Invocations && inv.Invocations.Invocation && inv.Invocations.Invocation[0];
    if (!invItem) { continue; }
    const inst = invItem.InvokeInstances && invItem.InvokeInstances.InvokeInstance && invItem.InvokeInstances.InvokeInstance[0];
    const instStatus = inst && inst.InstanceInvokeStatus; // Finished/Running/Pending
    if (instStatus && instStatus !== 'Running' && instStatus !== 'Pending') {
      finalResult = inst;
      break;
    }
    // 回退用 invoke 级状态
    if (invItem.InvokeStatus && invItem.InvokeStatus !== 'Running' && invItem.InvokeStatus !== 'Pending') {
      finalResult = inst || { InvokeStatus: invItem.InvokeStatus };
      break;
    }
  }

  // 3. 拉取输出
  const det = await callEcs({ Action: 'DescribeInvocationResults', RegionId: REGION, InvokeId: invokeId, InstanceId: INSTANCE_ID });
  const r = (det.Invocation && det.Invocation.InvocationResults && det.Invocation.InvocationResults.InvocationResult && det.Invocation.InvocationResults.InvocationResult[0]) || finalResult;
  if (!r) { process.stdout.write(`STATUS=timeout NO_RESULT\n`); process.exitCode = 3; return; }
  const status = r.InvokeStatus || (finalResult && finalResult.InstanceInvokeStatus) || 'Unknown';
  process.stdout.write(`STATUS=${status} EXITCODE=${r.ExitCode ?? 'null'}\n`);
  if (r.Output) {
    try {
      const decoded = Buffer.from(r.Output, 'base64').toString('utf8');
      process.stdout.write('---OUTPUT---\n' + decoded + '\n---END---\n');
    } catch {
      process.stdout.write('---OUTPUT(raw)---\n' + r.Output + '\n');
    }
  }
  if (r.ErrorInfo) process.stderr.write('ERR: ' + r.ErrorInfo + '\n');
  // 失败判定：exitCode 非零 或 status 为 Failed/Error
  if (status === 'Failed' || status === 'Error' || (r.ExitCode != null && r.ExitCode !== 0)) process.exitCode = 2;
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
