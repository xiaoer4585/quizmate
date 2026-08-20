const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const CHANGE_ID = 'CHG-20260820-05';
const OBJECTS = [
  ['mac/latest-mac.yml', path.join(SITE, 'mac/latest-mac.yml'), 'text/yaml; charset=utf-8'],
  ['download.html', path.join(SITE, 'download.html'), 'text/html; charset=utf-8'],
];

function getProfile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return profile;
}

function createClient(bucket, profile) {
  return new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket, secure: true,
    accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined, timeout: 120_000 });
}

async function backup(storage, object) {
  const target = `rollback/${CHANGE_ID}/${object}`;
  try { await storage.head(object); await storage.copy(target, object); console.log(`BACKUP_OK ${storage.options.bucket}/${object}`); }
  catch (error) { if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return; throw error; }
}

async function upload(storage, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  await storage.put(object, file, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
  const remote = await storage.get(object);
  const local = fs.readFileSync(file);
  if (!remote.content.equals(local)) throw new Error(`Content mismatch: ${object}`);
  console.log(`UPLOAD_VERIFY_OK ${storage.options.bucket}/${object} size=${local.length}`);
}

async function main() {
  const profile = getProfile();
  for (const bucket of ['quizmate-cn', 'quizmate-vip']) {
    const storage = createClient(bucket, profile);
    for (const [object, file, contentType] of OBJECTS) { await backup(storage, object); await upload(storage, object, file, contentType); }
  }
  console.log('DEPLOY_MAC_METADATA_OK version=2026.8.21');
}
main().catch((error) => { console.error(`DEPLOY_MAC_METADATA_FAILED ${error.code || ''} ${error.message}`); process.exitCode = 1; });
