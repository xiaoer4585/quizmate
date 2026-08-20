// CHG-20260819-04 面试助手双层参考回答（答题思路 + 分隔符 + 详细回答）
// 部署范围：后端(ECS quizmate-api-shadow) 仅 3 个文件：
//   dist/src/actions/speech.js        （buildInterviewPrompt / formatInterviewAnswer / INTERVIEW_SECTION_DIVIDER）
//   dist/src/actions/configuration.js （DEFAULT_INTERVIEW_PROMPT 双层结构 + 岗位专家角色）
//   dist/src/services/model.js        （INTERVIEW_SYSTEM_PROMPT + 面试 max_tokens 900->1600）
// 安全说明：本地已验证这 3 个 dist 文件与纯已提交源码(worktree@358a568)构建产物逐字节一致，
// 不包含并行开发中的兑换码/充值赠送等未提交逻辑。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260819-04-INTERVIEW-TWO-LAYER';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;

const BACKEND_FILES = [
  'dist/src/actions/speech.js',
  'dist/src/actions/configuration.js',
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

function pctEncode(value) { return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E'); }
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

async function deployBackend(auth) {
  // 校验编译产物包含本次功能标记
  const checks = [
    ['dist/src/actions/speech.js', ['INTERVIEW_SECTION_DIVIDER', '答题思路', '详细回答']],
    ['dist/src/actions/configuration.js', ['资深专家', '答题思路', '详细回答']],
    ['dist/src/services/model.js', ['【答题思路】', '【详细回答】']],
  ];
  for (const [file, markers] of checks) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of markers) {
      if (!content.includes(marker)) throw new Error(`${file} lacks marker ${marker}`);
    }
  }
  // 确保未夹带并行开发中的兑换码/充值赠送逻辑
  const mustNotContain = ['redemption', 'oldUserBonus', 'OLD_USER_RECHARGE_BONUS'];
  for (const file of BACKEND_FILES) {
    const content = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    for (const marker of mustNotContain) {
      if (content.includes(marker)) throw new Error(`${file} contains unexpected marker ${marker}`);
    }
  }
  for (const file of BACKEND_FILES) {
    process.stdout.write(`LOCAL_SHA256 ${path.basename(file)} ${sha256(fs.readFileSync(path.join(BACKEND_DIR, file)))}\n`);
  }
  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...BACKEND_FILES]);
  const client = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined });
  await client.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = client.signatureUrl(PACKAGE_OBJECT, { expires: 600 });
  const remote = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-interview-two-layer-\$TS
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/actions/speech.js" "\$BACKUP/speech.js"
cp -a "\$APP/dist/src/actions/configuration.js" "\$BACKUP/configuration.js"
cp -a "\$APP/dist/src/services/model.js" "\$BACKUP/model.js"
rollback() { code=\$?; if [ -f "\$BACKUP/speech.js" ]; then cp -a "\$BACKUP/speech.js" "\$APP/dist/src/actions/speech.js"; cp -a "\$BACKUP/configuration.js" "\$APP/dist/src/actions/configuration.js"; cp -a "\$BACKUP/model.js" "\$APP/dist/src/services/model.js"; systemctl restart quizmate-api-shadow.service || true; fi; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-interview-two-layer.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-interview-two-layer.tar.gz -C "\$APP"
grep -q 'INTERVIEW_SECTION_DIVIDER' "\$APP/dist/src/actions/speech.js"
grep -q '资深专家' "\$APP/dist/src/actions/configuration.js"
grep -q '【答题思路】' "\$APP/dist/src/services/model.js"
if grep -rq 'redemption\\|oldUserBonus\\|OLD_USER_RECHARGE_BONUS' "\$APP/dist/src/actions/speech.js" "\$APP/dist/src/actions/configuration.js" "\$APP/dist/src/services/model.js"; then echo UNEXPECTED_PARALLEL_WORK_LEAKED; exit 1; fi
echo '--- diff speech.js (old -> new) ---'
diff -u "\$BACKUP/speech.js" "\$APP/dist/src/actions/speech.js" | head -100 || true
echo '--- diff configuration.js (old -> new) ---'
diff -u "\$BACKUP/configuration.js" "\$APP/dist/src/actions/configuration.js" | head -60 || true
echo '--- diff model.js (old -> new) ---'
diff -u "\$BACKUP/model.js" "\$APP/dist/src/services/model.js" | head -60 || true
echo '--- deployed sha256 ---'
sha256sum "\$APP/dist/src/actions/speech.js" "\$APP/dist/src/actions/configuration.js" "\$APP/dist/src/services/model.js"
echo '--- functional smoke (deployed artifact) ---'
node --input-type=module -e "
import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL('/opt/quizmate-api-shadow/dist/src/actions/speech.js').href);
const ctx = { position: 'AI 应用工程师', company: '', jobDescription: '', resumeText: '', language: 'zh', answerStyle: 'detailed' };
const p1 = m.buildInterviewPrompt('设计一个企业内部智能客服系统，支持多租户权限控制，请描述整体架构', ctx);
const ok1 = p1.includes('答题思路') && p1.includes('详细回答') && p1.includes('----------') && p1.includes('资深专家') && p1.includes('先输出【答题思路】再输出【详细回答】');
const p2 = m.buildInterviewPrompt('请介绍一下你自己', { ...ctx, answerStyle: 'concise' });
const ok2 = p2.includes('这是自我介绍问题') && p2.includes('先输出【详细回答】');
const fmt = m.formatInterviewAnswer('【答题思路】\\n第一步\\n第二步\\n-------------\\n【详细回答】\\n结论。 1、要点一。');
const ok3 = fmt.includes('----------') && fmt.includes('【详细回答】\\n\\n结论。');
console.log('REMOTE_LOGIC_PROMPT_OK=' + ok1);
console.log('REMOTE_NORMAL_PROMPT_OK=' + ok2);
console.log('REMOTE_FORMAT_OK=' + ok3);
if (ok1 && ok2 && ok3) { } else { process.exit(1); }
"
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
trap - ERR
echo BACKUP=\$BACKUP
echo DEPLOY_INTERVIEW_TWO_LAYER_OK`);
  if (!remote.includes('DEPLOY_INTERVIEW_TWO_LAYER_OK')) throw new Error('deployment marker missing');
}

async function main() {
  const auth = credentials();
  await deployBackend(auth);
  process.stdout.write('BACKEND_DEPLOY_DONE\n');
  process.stdout.write('ALL_DEPLOY_OK\n');
}

main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.message}\n`); process.exitCode = 1; });
