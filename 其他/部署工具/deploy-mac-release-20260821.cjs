const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const RELEASE = path.join(ROOT, 'mac客户端/发布包/2026.8.21');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const CHANGE_ID = 'CHG-20260820-04';
const OBJECTS = [
  ['downloads/QuizMate-Mac-Apple-Silicon-2026.8.21.dmg', path.join(RELEASE, 'QuizMate-Mac-Apple-Silicon-2026.8.21.dmg'), 'application/x-apple-diskimage'],
  ['downloads/QuizMate-Mac-Intel-2026.8.21.dmg', path.join(RELEASE, 'QuizMate-Mac-Intel-2026.8.21.dmg'), 'application/x-apple-diskimage'],
  ['mac/QuizMate-Mac-arm64-2026.8.21.zip', path.join(RELEASE, 'QuizMate-Mac-arm64-2026.8.21.zip'), 'application/zip'],
  ['mac/QuizMate-Mac-x64-2026.8.21.zip', path.join(RELEASE, 'QuizMate-Mac-x64-2026.8.21.zip'), 'application/zip'],
  ['mac/latest-mac.yml', path.join(SITE, 'mac/latest-mac.yml'), 'text/yaml; charset=utf-8'],
  ['download.html', path.join(SITE, 'download.html'), 'text/html; charset=utf-8'],
];

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const value = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!value?.access_key_id || !value?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return value;
}

function client(bucket, value) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket,
    secure: true,
    accessKeyId: value.access_key_id,
    accessKeySecret: value.access_key_secret,
    stsToken: value.sts_token || undefined,
    timeout: 1_200_000,
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function backup(storage, object) {
  const target = `rollback/${CHANGE_ID}/${object}`;
  try {
    await storage.head(object);
    await storage.copy(target, object);
    console.log(`BACKUP_OK ${storage.options.bucket}/${object}`);
  } catch (error) {
    if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return;
    throw error;
  }
}

async function upload(storage, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing release file: ${file}`);
  const local = fs.readFileSync(file);
  const result = await storage.multipartUpload(object, file, {
    parallel: 16,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  const remote = await storage.get(object);
  if (sha256(remote.content) !== sha256(local)) throw new Error(`Hash mismatch: ${object}`);
  console.log(`UPLOAD_VERIFY_OK ${storage.options.bucket}/${object} size=${local.length}`);
}

async function main() {
  const value = profile();
  for (const bucket of ['quizmate-cn', 'quizmate-vip']) {
    const storage = client(bucket, value);
    for (const [object, file, contentType] of OBJECTS) {
      await backup(storage, object);
      await upload(storage, object, file, contentType);
    }
  }
  console.log('DEPLOY_MAC_RELEASE_OK version=2026.8.21');
}

main().catch((error) => {
  console.error(`DEPLOY_MAC_RELEASE_FAILED ${error.code || ''} ${error.message}`);
  process.exitCode = 1;
});
