const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const BUCKET = 'quizmate-cn';
const ENDPOINT = 'https://oss-cn-beijing.aliyuncs.com';
const CHANGE_ID = 'CHG-20260824';
const ROLLBACK = `rollback/${CHANGE_ID}`;

const OBJECTS = [
  ['download.html', path.join(SITE, 'download.html'), 'text/html; charset=utf-8'],
  ['index.html', path.join(SITE, 'index.html'), 'text/html; charset=utf-8'],
  ['mac/latest-mac.yml', path.join(SITE, 'mac/latest-mac.yml'), 'text/yaml; charset=utf-8'],
];

function profile() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const value = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!value?.access_key_id || !value?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return value;
}

function client(value) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: ENDPOINT,
    bucket: BUCKET,
    secure: true,
    accessKeyId: value.access_key_id,
    accessKeySecret: value.access_key_secret,
    stsToken: value.sts_token || undefined,
    timeout: 1_200_000,
  });
}

async function backup(storage, object) {
  const target = `${ROLLBACK}/previous/${object}`;
  try {
    await storage.head(object);
    await storage.copy(target, object);
    console.log(`BACKUP_OK ${object}`);
  } catch (error) {
    if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return;
    throw error;
  }
}

function isDisabledMacArtifact(object) {
  if (!object.startsWith('downloads/QuizMate-Mac-') && !object.startsWith('mac/QuizMate-Mac-')) return false;
  const match = object.match(/2026\.8\.(\d+)(?:\.\d+)?/);
  return Boolean(match && Number(match[1]) >= 22);
}

async function disableTemporaryArtifacts(storage) {
  let marker;
  let moved = 0;
  do {
    const result = await storage.listV2({ prefix: 'downloads/QuizMate-Mac-', marker, 'max-keys': 1000 });
    for (const item of result.objects || []) {
      if (!isDisabledMacArtifact(item.name)) continue;
      const target = `${ROLLBACK}/disabled/${item.name}`;
      try { await storage.head(target); } catch (error) {
        if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error;
        await storage.copy(target, item.name);
      }
      await storage.delete(item.name);
      console.log(`DISABLED ${item.name} -> ${target}`);
      moved++;
    }
    marker = result.nextMarker;
  } while (marker);

  marker = undefined;
  do {
    const result = await storage.listV2({ prefix: 'mac/QuizMate-Mac-', marker, 'max-keys': 1000 });
    for (const item of result.objects || []) {
      if (!isDisabledMacArtifact(item.name)) continue;
      const target = `${ROLLBACK}/disabled/${item.name}`;
      try { await storage.head(target); } catch (error) {
        if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error;
        await storage.copy(target, item.name);
      }
      await storage.delete(item.name);
      console.log(`DISABLED ${item.name} -> ${target}`);
      moved++;
    }
    marker = result.nextMarker;
  } while (marker);
  return moved;
}

async function upload(storage, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  await backup(storage, object);
  await storage.put(object, file, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
  const head = await storage.head(object);
  console.log(`UPLOAD_OK ${object} size=${head.res.headers['content-length'] || '?'}`);
}

async function main() {
  const storage = client(profile());
  const disabled = await disableTemporaryArtifacts(storage);
  for (const [object, file, contentType] of OBJECTS) await upload(storage, object, file, contentType);
  console.log(`DEPLOY_MAC_20260824_OK bucket=${BUCKET} disabled=${disabled}`);
}

main().catch((error) => {
  console.error(`DEPLOY_MAC_20260824_FAILED ${error.code || ''} ${error.message}`);
  process.exitCode = 1;
});
