// Scoped production publisher for CHG-20260909-07.
// Modes: public (quizmate-cn package + pages), admin (quizmate-vip admin only), all.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const CHANGE_ID = 'CHG-20260909-07';
const ROOT = path.resolve(__dirname, '../..');
const SITE_ROOT = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const EXTENSION_ZIP = path.join(ROOT, '扩展插件版/QuizMate-网申助手-2026.9.9.zip');
const EXTENSION_KEY = 'downloads/QuizMate-网申助手-2026.9.9.zip';
const ADMIN_FILE = path.join(SITE_ROOT, 'admin-web/index.html');
const mode = String(process.argv[2] || 'all').toLowerCase();

function credentials() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile missing');
  return { id: profile.access_key_id, secret: profile.access_key_secret, token: profile.sts_token || '' };
}

function client(bucket, auth) {
  return new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket, secure: true, accessKeyId: auth.id, accessKeySecret: auth.secret, stsToken: auth.token || undefined, timeout: 300000 });
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function backupObject(oss, key, label) {
  const backupKey = `rollback/${CHANGE_ID}/${label}`;
  try {
    const previous = await oss.get(key);
    await oss.put(backupKey, previous.content, { headers: { 'Cache-Control': 'no-cache' } });
    process.stdout.write(`BACKUP_OK bucket=${oss.options.bucket} source=${key} rollback=${backupKey} sha256=${sha256(previous.content)}\n`);
  } catch (error) {
    if (error.status === 404 || error.code === 'NoSuchKey') {
      process.stdout.write(`BACKUP_NEW_OBJECT bucket=${oss.options.bucket} source=${key}\n`);
      return;
    }
    throw error;
  }
}

async function putAndVerify(oss, key, file, contentType) {
  const local = fs.readFileSync(file);
  await oss.put(key, file, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
  const remote = await oss.get(key);
  if (sha256(local) !== sha256(remote.content)) throw new Error(`hash mismatch: ${key}`);
  process.stdout.write(`UPLOAD_OK bucket=${oss.options.bucket} key=${key} bytes=${local.length} sha256=${sha256(local)}\n`);
  return remote.content;
}

async function publishPublic(auth) {
  for (const file of [EXTENSION_ZIP, path.join(SITE_ROOT, 'download.html'), path.join(SITE_ROOT, 'index.html')]) {
    if (!fs.existsSync(file)) throw new Error(`missing public file: ${file}`);
  }
  const oss = client('quizmate-cn', auth);
  for (const [key, label] of [[EXTENSION_KEY, 'extension-package.before.zip'], ['download.html', 'download.before.html'], ['index.html', 'index.before.html']]) {
    await backupObject(oss, key, label);
  }
  const extension = await putAndVerify(oss, EXTENSION_KEY, EXTENSION_ZIP, 'application/zip');
  const download = await putAndVerify(oss, 'download.html', path.join(SITE_ROOT, 'download.html'), 'text/html; charset=utf-8');
  const index = await putAndVerify(oss, 'index.html', path.join(SITE_ROOT, 'index.html'), 'text/html; charset=utf-8');
  const marker = encodeURIComponent('QuizMate-网申助手-2026.9.9.zip');
  if (!download.toString('utf8').includes(marker) || !index.toString('utf8').includes(marker)) throw new Error('public pages missing extension marker');
  if (!extension.length) throw new Error('extension object is empty');
  process.stdout.write('PUBLIC_STATIC_DEPLOY_OK\n');
}

async function publishAdmin(auth) {
  if (!fs.existsSync(ADMIN_FILE)) throw new Error(`missing admin file: ${ADMIN_FILE}`);
  const oss = client('quizmate-vip', auth);
  await backupObject(oss, 'admin-web/index.html', 'admin-web.index.before.html');
  const content = await putAndVerify(oss, 'admin-web/index.html', ADMIN_FILE, 'text/html; charset=utf-8');
  const html = content.toString('utf8');
  for (const marker of ['adminUpsertResumeRule', 'adminSetSiteConfig', 'siteEngineConfig', '维护网申热规则']) {
    if (!html.includes(marker)) throw new Error(`admin marker missing: ${marker}`);
  }
  process.stdout.write('VIP_ADMIN_DEPLOY_OK\n');
}

(async () => {
  if (!['public', 'admin', 'all'].includes(mode)) throw new Error('mode must be public, admin, or all');
  const auth = credentials();
  if (mode === 'public' || mode === 'all') await publishPublic(auth);
  if (mode === 'admin' || mode === 'all') await publishAdmin(auth);
})().catch((error) => { console.error('STATIC_DEPLOY_FAILED', error.message); process.exitCode = 1; });
