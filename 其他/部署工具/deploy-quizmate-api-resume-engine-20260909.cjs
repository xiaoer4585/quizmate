// CHG-20260909-07: deploy the free resume workflow and declarative site engine.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260909-07';
const BACKEND_DIR = path.resolve(__dirname, '../../注册登陆模块/阿里云后端-quizmate-api');
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const PACKAGE_FILE = path.resolve(__dirname, `../tmp/quizmate-api-${CHANGE_ID}.tar.gz`);
const PACKAGE_OBJECT = `deploy/quizmate-api-${CHANGE_ID}.tar.gz`;
const FILES = [
  'dist/src/server.js',
  'dist/src/actions/admin.js',
  'dist/src/actions/configuration.js',
  'dist/src/actions/resume.js',
  'dist/src/actions/site-engine.js',
  'dist/src/actions/index.js',
  'dist/src/services/model.js',
  'dist/src/services/runtime-settings.js',
  'migrations/019_resume_page_rules.sql',
  'migrations/021_site_engine.sql',
  'migrations/022_site_engine_declarative_compat.sql'
];

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile missing');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}
function encode(value) { return encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E'); }
function sign(query, secret) { return crypto.createHmac('sha1', `${secret}&`).update(`GET&${encode('/')}&${encode(query)}`).digest('base64'); }
async function ecs(auth, params) {
  const common = { Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION, ...(auth.token ? { SecurityToken: auth.token } : {}), ...params };
  const query = Object.keys(common).sort().map((key) => `${encode(key)}=${encode(common[key])}`).join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${encode(sign(query, auth.sk))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}
async function runCommand(auth, command) {
  const started = await ecs(auth, { Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': INSTANCE_ID, CommandContent: command, Timeout: '600', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root' });
  const deadline = Date.now() + 720000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await ecs(auth, { Action: 'DescribeInvocations', InvokeId: started.InvokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await ecs(auth, { Action: 'DescribeInvocationResults', InvokeId: started.InvokeId, InstanceId: INSTANCE_ID });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) throw new Error(`remote deployment failed: ${status}`);
    return output;
  }
  throw new Error('remote deployment timed out');
}

async function main() {
  for (const file of FILES) if (!fs.existsSync(path.join(BACKEND_DIR, file))) throw new Error(`missing ${file}`);
  for (const [file, marker] of [
    ['dist/src/server.js', 'createStructuredModel'],
    ['dist/src/actions/resume.js', 'parseAutofillProfile: 0'],
    ['dist/src/actions/site-engine.js', 'getSiteEngineConfig'],
    ['dist/src/actions/admin.js', 'adminUpsertResumeRule'],
    ['dist/src/actions/configuration.js', 'QuizMate-%E7%BD%91%E7%94%B3%E5%8A%A9%E6%89%8B-2026.9.9.zip'],
    ['dist/src/services/model.js', 'createStructuredModel'],
    ['dist/src/services/runtime-settings.js', 'resume_text_model_config']
  ]) if (!fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8').includes(marker)) throw new Error(`${file} missing marker ${marker}`);

  fs.mkdirSync(path.dirname(PACKAGE_FILE), { recursive: true });
  execFileSync('tar', ['-czf', PACKAGE_FILE, '-C', BACKEND_DIR, ...FILES]);
  process.stdout.write(`PACKAGE_SHA256=${crypto.createHash('sha256').update(fs.readFileSync(PACKAGE_FILE)).digest('hex')}\n`);
  const auth = credentials();
  const oss = new OSS({ region: REGION, endpoint: 'https://oss-cn-beijing.aliyuncs.com', secure: true, bucket: 'quizmate-vip', accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined, timeout: 300000 });
  await oss.put(PACKAGE_OBJECT, PACKAGE_FILE, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-cache' } });
  const signedUrl = oss.signatureUrl(PACKAGE_OBJECT, { expires: 900 });

  const output = await runCommand(auth, `set -Eeuo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
APP=/opt/quizmate-api-shadow
BACKUP=\$APP.rollback-${CHANGE_ID}-\$TS
cd "\$APP"
mkdir -p "\$BACKUP"
cp -a "\$APP/dist/src/actions" "\$BACKUP/actions"
cp -a "\$APP/dist/src/server.js" "\$BACKUP/server.js"
cp -a "\$APP/dist/src/services/model.js" "\$BACKUP/model.js"
cp -a "\$APP/dist/src/services/runtime-settings.js" "\$BACKUP/runtime-settings.js"
mkdir -p "\$BACKUP/migrations"
for file in 019_resume_page_rules.sql 021_site_engine.sql 022_site_engine_declarative_compat.sql; do if [ -f "\$APP/migrations/\$file" ]; then cp -a "\$APP/migrations/\$file" "\$BACKUP/migrations/\$file"; fi; done
set -a; . /etc/quizmate-api-shadow.env; set +a
SETTING_FILE="\$BACKUP/input_extension_download.json" node --input-type=module <<'NODE'
import fs from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query("SELECT setting_key, value, updated_at, updated_by FROM settings WHERE setting_key = 'input_extension_download'");
fs.writeFileSync(process.env.SETTING_FILE, JSON.stringify(result.rows[0] || null));
await pool.end();
NODE
echo "BACKUP_DIR=\$BACKUP"
rollback() { code=\$?; cp -a "\$BACKUP/actions/." "\$APP/dist/src/actions/"; cp -a "\$BACKUP/server.js" "\$APP/dist/src/server.js"; cp -a "\$BACKUP/model.js" "\$APP/dist/src/services/model.js"; cp -a "\$BACKUP/runtime-settings.js" "\$APP/dist/src/services/runtime-settings.js"; SETTING_FILE="\$BACKUP/input_extension_download.json" node --input-type=module <<'NODE'
import fs from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const old = JSON.parse(fs.readFileSync(process.env.SETTING_FILE, 'utf8'));
if (old) await pool.query("INSERT INTO settings(setting_key,value,updated_at,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(setting_key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by", [old.setting_key, old.value, old.updated_at, old.updated_by]);
else await pool.query("DELETE FROM settings WHERE setting_key = 'input_extension_download'");
await pool.end();
NODE
systemctl restart quizmate-api-shadow.service || true; echo AUTO_ROLLBACK_DONE; exit \$code; }
trap rollback ERR
curl -fsSL -o /tmp/quizmate-api-${CHANGE_ID}.tar.gz '${signedUrl}'
tar -xzf /tmp/quizmate-api-${CHANGE_ID}.tar.gz -C "\$APP"
node_modules/.bin/tsx scripts/migrate.ts
node --input-type=module <<'NODE'
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const value = { version: '2026.9.9', fileName: 'QuizMate-网申助手-2026.9.9.zip', downloadUrl: 'https://www.quizmate.cn/downloads/QuizMate-%E7%BD%91%E7%94%B3%E5%8A%A9%E6%89%8B-2026.9.9.zip', updatedAt: new Date().toISOString() };
await pool.query("INSERT INTO settings(setting_key,value,updated_at,updated_by) VALUES ('input_extension_download',$1::jsonb,now(),'release-${CHANGE_ID}') ON CONFLICT(setting_key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by", [JSON.stringify(value)]);
const schema = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='resume_engine_patches' AND column_name IN ('patch','code') ORDER BY column_name");
console.log('SITE_ENGINE_COLUMNS=' + JSON.stringify(schema.rows));
await pool.end();
NODE
sha256sum dist/src/server.js dist/src/actions/admin.js dist/src/actions/configuration.js dist/src/actions/resume.js dist/src/actions/site-engine.js dist/src/actions/index.js dist/src/services/model.js dist/src/services/runtime-settings.js
systemctl restart quizmate-api-shadow.service
sleep 3
systemctl is-active quizmate-api-shadow.service
curl -fsS http://127.0.0.1:8200/health
echo
curl -sS -o /tmp/site-engine-noauth.json -w 'site_engine_noauth_http=%{http_code}\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{"action":"getSiteEngineConfig","hostname":"jobs.example.com"}'
grep -q '请先登录' /tmp/site-engine-noauth.json
curl -sS -o /tmp/resume-parse-noauth.json -w 'resume_parse_noauth_http=%{http_code}\n' -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{"action":"parseAutofillProfile","requestId":"release-smoke","text":"测试"}'
grep -q '请先登录' /tmp/resume-parse-noauth.json
curl -fsS -X POST http://127.0.0.1:8200/study-auth-api -H 'Content-Type: application/json' -d '{"action":"getInputExtensionDownload"}' | grep -q '2026.9.9'
trap - ERR
echo API_RESUME_ENGINE_DEPLOY_OK`);
  if (!output.includes('API_RESUME_ENGINE_DEPLOY_OK')) throw new Error('deployment marker missing');
}

main().catch((error) => { console.error('API_DEPLOY_FAILED', error.message); process.exitCode = 1; });
