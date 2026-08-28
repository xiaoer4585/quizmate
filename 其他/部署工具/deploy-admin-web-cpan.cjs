// 部署 admin-web/index.html 到 OSS quizmate-vip（备份+上传+校验 cpan 关键字）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('e:\\ai项目\\考试插件\\注册登陆模块\\阿里云统一入口-study-auth-api\\node_modules\\ali-oss');

function loadAliyunAk() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  return { id: profile.access_key_id, secret: profile.access_key_secret, token: profile.sts_token || '' };
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

const LOCAL_FILE = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/admin-web/index.html');
const OSS_OBJECT = 'admin-web/index.html';
const ROLLBACK_OBJECT = 'rollback/CHG-20260816-cpan-tracking/admin-web.index.before.html';

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) throw new Error('admin-web/index.html not found: ' + LOCAL_FILE);
  const AK = loadAliyunAk();
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: AK.id, accessKeySecret: AK.secret, stsToken: AK.token || undefined, timeout: 120000 });

  const previous = await client.get(OSS_OBJECT);
  await client.put(ROLLBACK_OBJECT, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  process.stdout.write('ADMIN_WEB_BACKUP_OK ' + ROLLBACK_OBJECT + ' bytes=' + previous.content.length + '\n');

  const result = await client.put(OSS_OBJECT, LOCAL_FILE, { headers: { 'Cache-Control': 'no-cache' } });
  if (result.res.status !== 200) throw new Error('OSS put failed: ' + result.res.status);
  process.stdout.write('ADMIN_WEB_UPLOAD_OK ' + OSS_OBJECT + ' ' + fs.statSync(LOCAL_FILE).size + ' bytes\n');

  const verifyRes = await client.get(OSS_OBJECT);
  process.stdout.write('VERIFY_OK status=' + verifyRes.res.status + ' bytes=' + verifyRes.content.length + '\n');
  const local = fs.readFileSync(LOCAL_FILE);
  const content = verifyRes.content.toString('utf8');
  const required = ['data-product="cpan"', 'data-view="cpanDashboard"', 'adminVisitTrend', 'adminDownloadTrend', 'data-view-tab="paymentConfig"', 'adminSetPaymentConfig', 'LEGACY_API_ENDPOINTS'];
  for (const kw of required) { if (!content.includes(kw)) throw new Error('uploaded admin page missing: ' + kw); }
  if (sha256(local) !== sha256(verifyRes.content)) throw new Error('uploaded admin page hash mismatch');
  process.stdout.write('HAS_CPAN_TRACKING_MENU=true\n');
  process.stdout.write('HAS_PAYMENT_CONFIG_MENU=true\n');
  process.stdout.write('ADMIN_WEB_SHA256=' + sha256(local) + '\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
