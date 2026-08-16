const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

function loadCredentials() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(raw);
  const profile = (cfg.profiles || []).find((p) => p.name === cfg.current) || (cfg.profiles || [])[0];
  if (!profile) throw new Error('aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret };
}

const creds = loadCredentials();
const APK_LOCAL = path.resolve(__dirname, '../安卓端/QuizMate-Android/release/QuizMate-Android-2026.07.31.apk');
const OSS_APK = 'downloads/QuizMate-Android-2026.07.31.apk';
const DOWNLOAD_HTML = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/download.html');

async function main() {
  const client = new OSS({
    endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip',
    secure: true, accessKeyId: creds.ak, accessKeySecret: creds.sk, timeout: 120_000,
  });

  const apkSize = fs.statSync(APK_LOCAL).size;
  process.stdout.write(`Uploading APK (${(apkSize / 1024).toFixed(1)} KB)...\n`);
  const r1 = await client.put(OSS_APK, APK_LOCAL, {
    headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Cache-Control': 'no-cache' },
  });
  if (r1.res.status !== 200) throw new Error('apk upload failed');
  process.stdout.write(`APK_UPLOAD_OK\n`);

  const r2 = await client.put('download.html', DOWNLOAD_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
  if (r2.res.status !== 200) throw new Error('html upload failed');
  process.stdout.write('ALL_DONE\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
