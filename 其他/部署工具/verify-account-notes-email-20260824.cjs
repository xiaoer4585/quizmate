// CHG-20260824-03 验证：adminListAccountNoteTags / adminListCreditAccounts / adminUpsertAccountNote / adminBroadcastEmail
const { execFileSync } = require('child_process');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';

function aliyunCli(args) { return execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
function aliyunCliJson(args) { return JSON.parse(aliyunCli(args)); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runCommand(commandContent) {
  const run = aliyunCliJson(['ecs', 'RunCommand', '--RegionId', REGION, '--Type', 'RunShellScript', '--InstanceId.1', INSTANCE_ID, '--CommandContent', commandContent, '--Timeout', '120', '--EnableParameter', 'false', '--WorkingDir', '/root']);
  const invokeId = run.InvokeId;
  process.stdout.write('INVOKE_ID=' + invokeId + '\n');
  const deadline = Date.now() + 150 * 1000;
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
  if (!r) { process.stdout.write('NO_RESULT\n'); return; }
  process.stdout.write('STATUS=' + (r.InvokeStatus || 'Unknown') + ' EXITCODE=' + (r.ExitCode ?? 'null') + '\n');
  if (r.Output) process.stdout.write('---OUTPUT---\n' + Buffer.from(r.Output, 'base64').toString('utf8') + '\n---END---\n');
  if (r.ErrorInfo) process.stderr.write('ERR: ' + r.ErrorInfo + '\n');
}

async function main() {
  await runCommand(`set -a; . /etc/quizmate-api-shadow.env; set +a
echo "=== T1 adminListAccountNoteTags ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminListAccountNoteTags\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\"}" | head -c 400
echo
echo "=== T2 fetch accounts.json to tmp file ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminListCreditAccounts\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"page\\":1,\\"pageSize\\":3}" -o /tmp/accounts.json
ls -lh /tmp/accounts.json
head -c 200 /tmp/accounts.json
echo
ACCT=$(python3 -c "import json; d=json.load(open('/tmp/accounts.json')); print(d['data']['items'][0]['accountId'])")
echo "ACCT=$ACCT"
echo "=== T3 adminUpsertAccountNote ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminUpsertAccountNote\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"accountId\\":\\"$ACCT\\",\\"note\\":\\"smoke-test\\",\\"color\\":\\"blue\\",\\"contentHtml\\":\\"<p>hi</p>\\"}" | head -c 400
echo
echo "=== T4 adminListAccountNotes for that account ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminListAccountNotes\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"accountId\\":\\"$ACCT\\"}" | head -c 800
echo
echo "=== T5 adminBroadcastEmail to single account ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminBroadcastEmail\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"recipients\\":[\\"$ACCT\\"],\\"subject\\":\\"quizmate-smoke\\",\\"textBody\\":\\"hello from smoke test\\"}" | head -c 600
echo
echo "=== T6 adminListCreditAccounts with note filter ==="
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminListCreditAccounts\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"note\\":\\"smoke-test\\",\\"page\\":1,\\"pageSize\\":5}" | head -c 600
echo
echo "=== T7 get note_id and delete ==="
NOTE_ID=$(curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminListAccountNotes\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"accountId\\":\\"$ACCT\\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['items'][0]['noteId'])")
echo "NOTE_ID=$NOTE_ID"
curl -s -X POST http://127.0.0.1:8200/study-auth-api -H "Content-Type: application/json" -d "{\\"action\\":\\"adminDeleteAccountNote\\",\\"adminSecret\\":\\"$ADMIN_SECRET\\",\\"noteId\\":\\"$NOTE_ID\\"}" | head -c 400
echo
echo "=== T8 audit log tail ==="
psql "$DATABASE_URL" -c "SELECT action, target_id, created_at FROM admin_audit_logs WHERE action IN ('upsert_account_note','delete_account_note','broadcast_email') ORDER BY created_at DESC LIMIT 8;" 2>&1 | head -30
echo ALL_DONE`);
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });