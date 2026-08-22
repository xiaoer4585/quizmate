const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const VERSION = '2026.8.22.1';
const CHANGE_ID = 'CHG-20260822-11';
const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const RELEASE_OBJECTS = [
  `downloads/QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`,
  `downloads/QuizMate-Mac-Intel-${VERSION}.dmg`,
  `mac/QuizMate-Mac-arm64-${VERSION}.zip`,
  `mac/QuizMate-Mac-x64-${VERSION}.zip`,
];

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];

function client() {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined,
    timeout: 1200000,
  });
}

async function exists(storage, object) {
  try {
    return await storage.head(object);
  } catch (error) {
    if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return null;
    throw error;
  }
}

async function digestObject(storage, object) {
  const response = await storage.getStream(object);
  const hash = crypto.createHash('sha512');
  let size = 0;
  for await (const chunk of response.stream) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha512: hash.digest('base64'), size };
}

async function backup(storage, object) {
  if (await exists(storage, object)) {
    await storage.copy(`rollback/${CHANGE_ID}/${object}`, object);
    console.log(`BACKUP_OK quizmate-cn/${object}`);
  }
}

async function putText(storage, object, content, contentType) {
  await backup(storage, object);
  await storage.put(object, Buffer.from(content, 'utf8'), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
  const readBack = await storage.get(object);
  if (readBack.content.toString('utf8') !== content) throw new Error(`readback mismatch: ${object}`);
  console.log(`PUBLISH_OK quizmate-cn/${object}`);
}

async function main() {
  const storage = client();
  for (const object of RELEASE_OBJECTS) {
    const head = await exists(storage, object);
    if (!head) throw new Error(`missing release object: ${object}`);
    console.log(`OBJECT_OK quizmate-cn/${object} size=${head.res.headers['content-length']}`);
  }

  const arm = await digestObject(storage, `mac/QuizMate-Mac-arm64-${VERSION}.zip`);
  const x64 = await digestObject(storage, `mac/QuizMate-Mac-x64-${VERSION}.zip`);
  const releaseDate = new Date().toISOString();
  const manifest = [
    `version: ${VERSION}`,
    'files:',
    `  - url: QuizMate-Mac-arm64-${VERSION}.zip`,
    `    sha512: ${arm.sha512}`,
    `    size: ${arm.size}`,
    `  - url: QuizMate-Mac-x64-${VERSION}.zip`,
    `    sha512: ${x64.sha512}`,
    `    size: ${x64.size}`,
    `path: QuizMate-Mac-arm64-${VERSION}.zip`,
    `sha512: ${arm.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');

  const downloadHtml = fs.readFileSync(path.join(SITE, 'download.html'), 'utf8');
  for (const required of [
    `QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`,
    `QuizMate-Mac-Intel-${VERSION}.dmg`,
    `<strong>${VERSION}</strong>`,
  ]) {
    if (!downloadHtml.includes(required)) throw new Error(`download.html missing ${required}`);
  }

  await putText(storage, 'mac/latest-mac.yml', manifest, 'text/yaml; charset=utf-8');
  await putText(storage, 'download.html', downloadHtml, 'text/html; charset=utf-8');
  console.log(`DEPLOY_MAC_RELEASE_OK version=${VERSION} bucket=quizmate-cn`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
