const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OSS = require(require.resolve('ali-oss', {
  paths: [path.join(ROOT, '注册登陆模块/阿里云统一入口-study-auth-api/node_modules')],
}));

const INTERNAL_VERSION = '2026.9.18003';
const PUBLIC_VERSION = '2026.09.18.3';
const CHANGE_ID = 'CHG-20260918-03';
const RELEASE_DIR = path.resolve(process.env.QUIZMATE_RELEASE_DIR || path.join(
  ROOT,
  'windows客户端/QuizMate-Windows/releases/2026-09-18-prod',
));
const EXE_NAME = `QuizMate-Windows-${PUBLIC_VERSION}.exe`;
const BLOCKMAP_NAME = `${EXE_NAME}.blockmap`;
const SITE_DIR = path.join(ROOT, '官网模块/正式官网-quizmate.vip');

const files = {
  exe: path.join(RELEASE_DIR, EXE_NAME),
  blockmap: path.join(RELEASE_DIR, BLOCKMAP_NAME),
  latest: path.join(RELEASE_DIR, 'latest.yml'),
  appUpdate: path.join(RELEASE_DIR, 'app-update.yml'),
  download: path.join(SITE_DIR, 'download.html'),
  index: path.join(SITE_DIR, 'index.html'),
  docs: path.join(SITE_DIR, 'docs.html'),
  article: path.join(SITE_DIR, 'blog/article-exam-skills.html'),
};

const mutableObjects = [
  'suite/latest.yml',
  'downloads/latest.yml',
  'download.html',
  'index.html',
  'docs.html',
  'blog/article-exam-skills.html',
];

function loadProfile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const selected = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!selected?.access_key_id || !selected?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return selected;
}

function storageClient(profile) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined,
    timeout: 1_200_000,
  });
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

async function digestObject(storage, object) {
  const response = await storage.getStream(object);
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const chunk of response.stream) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest('hex') };
}

function assertInputs() {
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) throw new Error(`Missing release input ${name}: ${file}`);
  }
  const latest = fs.readFileSync(files.latest, 'utf8');
  if (!latest.includes(`version: ${INTERNAL_VERSION}`)) throw new Error('latest.yml internal version mismatch');
  if (!latest.includes(EXE_NAME)) throw new Error('latest.yml public filename mismatch');
  const appUpdate = fs.readFileSync(files.appUpdate, 'utf8');
  if (!/^url:\s+https:\/\/quizmate\.cn\/suite\/$/m.test(appUpdate)
    && !/^url:\s+https:\/\/www\.quizmate\.cn\/suite\/$/m.test(appUpdate)) {
    throw new Error('app-update.yml does not point to the production suite channel');
  }
  for (const page of [files.download, files.index, files.article]) {
    if (!fs.readFileSync(page, 'utf8').includes(EXE_NAME)) {
      throw new Error(`Website page does not reference ${EXE_NAME}: ${page}`);
    }
  }
  if (!fs.readFileSync(files.docs, 'utf8').includes(PUBLIC_VERSION)) {
    throw new Error('docs.html does not show the current Windows version');
  }
  console.log(`PRECHECK_OK internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION} sha256=${sha256File(files.exe)}`);
}

async function backup(storage, object) {
  const rollback = `rollback/${CHANGE_ID}/${object}`;
  try {
    await storage.head(rollback);
    console.log(`BACKUP_KEEP ${rollback}`);
    return;
  } catch (error) {
    if (Number(error.status) !== 404 && String(error.code || '').toLowerCase() !== 'nosuchkey') throw error;
  }
  await storage.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`BACKUP_OK ${object} -> ${rollback}`);
}

async function upload(storage, object, file, contentType, cacheControl) {
  const result = await storage.multipartUpload(object, file, {
    parallel: 8,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  console.log(`UPLOAD_OK ${object}`);
}

async function restore(storage) {
  for (const object of mutableObjects) {
    try {
      await storage.copy(object, `rollback/${CHANGE_ID}/${object}`, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`ROLLBACK_OK ${object}`);
    } catch (error) {
      console.error(`ROLLBACK_FAILED ${object}: ${error.message}`);
    }
  }
}

async function publish(storage) {
  for (const object of mutableObjects) await backup(storage, object);

  await upload(storage, `suite/${EXE_NAME}`, files.exe, 'application/vnd.microsoft.portable-executable', 'public, max-age=31536000, immutable');
  await upload(storage, `suite/${BLOCKMAP_NAME}`, files.blockmap, 'application/octet-stream', 'public, max-age=31536000, immutable');
  await storage.copy(`downloads/${EXE_NAME}`, `suite/${EXE_NAME}`, {
    headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  await storage.copy(`downloads/${BLOCKMAP_NAME}`, `suite/${BLOCKMAP_NAME}`, {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });

  await upload(storage, 'suite/latest.yml', files.latest, 'text/yaml; charset=utf-8', 'no-cache, no-store, must-revalidate');
  await upload(storage, 'downloads/latest.yml', files.latest, 'text/yaml; charset=utf-8', 'no-cache, no-store, must-revalidate');
  await upload(storage, 'download.html', files.download, 'text/html; charset=utf-8', 'no-cache');
  await upload(storage, 'index.html', files.index, 'text/html; charset=utf-8', 'no-cache');
  await upload(storage, 'docs.html', files.docs, 'text/html; charset=utf-8', 'no-cache');
  await upload(storage, 'blog/article-exam-skills.html', files.article, 'text/html; charset=utf-8', 'no-cache');
}

async function verify(storage) {
  const expectedExe = { size: fs.statSync(files.exe).size, sha256: sha256File(files.exe) };
  const expectedBlockmap = { size: fs.statSync(files.blockmap).size, sha256: sha256File(files.blockmap) };
  for (const prefix of ['suite', 'downloads']) {
    const exe = await digestObject(storage, `${prefix}/${EXE_NAME}`);
    const blockmap = await digestObject(storage, `${prefix}/${BLOCKMAP_NAME}`);
    if (exe.size !== expectedExe.size || exe.sha256 !== expectedExe.sha256) throw new Error(`${prefix} EXE digest mismatch`);
    if (blockmap.size !== expectedBlockmap.size || blockmap.sha256 !== expectedBlockmap.sha256) throw new Error(`${prefix} blockmap digest mismatch`);
    console.log(`VERIFY_BINARY_OK ${prefix}/${EXE_NAME} size=${exe.size} sha256=${exe.sha256}`);
  }
  for (const object of ['suite/latest.yml', 'downloads/latest.yml']) {
    const text = (await storage.get(object)).content.toString('utf8');
    if (!text.includes(`version: ${INTERNAL_VERSION}`) || !text.includes(EXE_NAME)) throw new Error(`${object} verification failed`);
  }
  for (const object of ['download.html', 'index.html', 'blog/article-exam-skills.html']) {
    const text = (await storage.get(object)).content.toString('utf8');
    if (!text.includes(EXE_NAME)) throw new Error(`${object} verification failed`);
  }
  const docs = (await storage.get('docs.html')).content.toString('utf8');
  if (!docs.includes(PUBLIC_VERSION)) throw new Error('docs.html verification failed');
  console.log(`POSTVERIFY_OK internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION}`);
}

async function main() {
  assertInputs();
  const storage = storageClient(loadProfile());
  try {
    await publish(storage);
    await verify(storage);
  } catch (error) {
    await restore(storage);
    throw error;
  }
  console.log(`DEPLOY_WINDOWS_RELEASE_OK change=${CHANGE_ID} bucket=quizmate-cn`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
