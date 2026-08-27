// CHG-20260824-02 部署：admin-web 积分用户页新增便签筛选 / 多选 / 便签编辑 / 富文本邮件群发
// 流程：本地 index.html 语法校验 → 上传 OSS admin-web/ → 备份上一版 → 校验关键标记
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const LOCAL_FILE = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/admin-web/index.html');
const OSS_OBJECT = 'admin-web/index.html';
const ROLLBACK_OBJECT = 'rollback/CHG-20260824-02/admin-web.index.before-account-notes-email.html';

function loadAliyunAk() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  return { id: profile.access_key_id, secret: profile.access_key_secret, token: profile.sts_token || '' };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) throw new Error('admin-web/index.html not found: ' + LOCAL_FILE);
  const html = fs.readFileSync(LOCAL_FILE, 'utf8');
  // 部署前语法校验：内联脚本必须能通过 vm 解析，避免把坏页面推到线上
  const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const appScript = inlineScripts[inlineScripts.length - 1];
  if (appScript) {
    try { new (require('vm').Script)(appScript, { filename: 'admin-web-inline.js' }); }
    catch (e) { throw new Error('admin-web inline script syntax error: ' + e.message); }
  }
  // 关键标记自检
  const markers = [
    'id="noteModal"',
    'id="emailModal"',
    'id="accountNote"',
    'id="accountsBulkBar"',
    'adminListAccountNotes',
    'adminUpsertAccountNote',
    'adminDeleteAccountNote',
    'adminListAccountNoteTags',
    'adminBroadcastEmail',
    'selectedAccounts',
    'wangpengroy@qq.com',
    'quill.snow.css',
    'quill.min.js',
    'sendBroadcastEmail',
    'openNoteModal',
    'openEmailModal'
  ];
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error(`admin-web missing marker: ${marker}`);
  }
  const AK = loadAliyunAk();
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: AK.id, accessKeySecret: AK.secret, stsToken: AK.token || undefined, timeout: 120_000 });
  // 备份上一版
  const previous = await client.get(OSS_OBJECT);
  await client.put(ROLLBACK_OBJECT, previous.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  process.stdout.write('ADMIN_WEB_BACKUP_OK ' + ROLLBACK_OBJECT + ' bytes=' + previous.content.length + '\n');
  // 上传新版本
  const result = await client.put(OSS_OBJECT, LOCAL_FILE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  if (result.res.status !== 200) throw new Error('OSS put failed: ' + result.res.status);
  process.stdout.write('ADMIN_WEB_UPLOAD_OK ' + OSS_OBJECT + ' ' + fs.statSync(LOCAL_FILE).size + ' bytes\n');
  // 验证下载
  const verifyRes = await client.get(OSS_OBJECT);
  process.stdout.write('VERIFY_OK status=' + verifyRes.res.status + ' bytes=' + verifyRes.content.length + '\n');
  const content = verifyRes.content.toString('utf8');
  for (const marker of markers) {
    if (!content.includes(marker)) throw new Error(`uploaded admin page missing marker: ${marker}`);
  }
  const local = fs.readFileSync(LOCAL_FILE);
  if (sha256(local) !== sha256(verifyRes.content)) throw new Error('uploaded admin page hash mismatch');
  process.stdout.write('ADMIN_WEB_SHA256=' + sha256(local) + '\n');
  process.stdout.write('HAS_ACCOUNT_NOTES_EMAIL_UI=true\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });