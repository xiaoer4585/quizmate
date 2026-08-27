// CHG-20260803 部署 admin-web 到 OSS（上传更新后的 index.html 到 quizmate-vip bucket 的 admin-web/ 路径）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

function loadAliyunAk() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  return { id: profile.access_key_id, secret: profile.access_key_secret, token: profile.sts_token || '' };
}

const LOCAL_FILE = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/admin-web/index.html');
const OSS_OBJECT = 'admin-web/index.html';
const ROLLBACK_OBJECT = 'rollback/CHG-20260817-01/admin-web.index.before-cpan-product-switch.html';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) throw new Error('admin-web/index.html not found: ' + LOCAL_FILE);
  // 部署前语法校验：内联脚本必须能通过 node 语法解析，避免把坏页面推到线上
  const html = fs.readFileSync(LOCAL_FILE, 'utf8');
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const appScript = inlineScripts[inlineScripts.length - 1];
  if (appScript) {
    try { new (require('vm').Script)(appScript, { filename: 'admin-web-inline.js' }); }
    catch (e) { throw new Error('admin-web inline script syntax error: ' + e.message); }
  }
  const AK = loadAliyunAk();
  // bucket quizmate-vip 绑定了 CNAME www.quizmate.vip，必须用 cname 方式
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: AK.id, accessKeySecret: AK.secret, stsToken: AK.token || undefined, timeout: 120_000 });
  const previous = await client.get(OSS_OBJECT);
  await client.put(ROLLBACK_OBJECT, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  process.stdout.write('ADMIN_WEB_BACKUP_OK ' + ROLLBACK_OBJECT + ' bytes=' + previous.content.length + '\n');
  const result = await client.put(OSS_OBJECT, LOCAL_FILE, { headers: { 'Cache-Control': 'no-cache' } });
  if (result.res.status !== 200) throw new Error('OSS put failed: ' + result.res.status);
  process.stdout.write('ADMIN_WEB_UPLOAD_OK ' + OSS_OBJECT + ' ' + fs.statSync(LOCAL_FILE).size + ' bytes\n');

  // 验证下载
  const verifyRes = await client.get(OSS_OBJECT);
  process.stdout.write('VERIFY_OK status=' + verifyRes.res.status + ' bytes=' + verifyRes.content.length + '\n');
  const local = fs.readFileSync(LOCAL_FILE);
  const content = verifyRes.content.toString('utf8');
  if (!content.includes('data-view-tab="paymentConfig"') || !content.includes('adminSetPaymentConfig') || !content.includes('LEGACY_API_ENDPOINTS')) {
    throw new Error('uploaded admin page is missing payment configuration UI');
  }
  if (!content.includes('data-view-tab="cpanDashboard"') || !content.includes('switchProduct') || !content.includes('async function cpanLogin')) {
    throw new Error('uploaded admin page is missing cpan product switch UI');
  }
  if (sha256(local) !== sha256(verifyRes.content)) throw new Error('uploaded admin page hash mismatch');
  process.stdout.write('HAS_PAYMENT_CONFIG_MENU=true\n');
  process.stdout.write('ADMIN_WEB_SHA256=' + sha256(local) + '\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
