const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const moduleRoots = [
  path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const ROOT = path.resolve(__dirname, '../../..');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const MANUAL = path.join(ROOT, '运营管理/产品交付与宣传资料/学习悬浮助手操作手册.pdf');
const CHANGE_ID = 'CHG-20260910-03';
const INTERNAL_VERSION = '2026.9.10000';
const PUBLIC_VERSION = '2026.09.10';
const EXE = `QuizMate-Windows-${PUBLIC_VERSION}.exe`;
const BLOCKMAP = `${EXE}.blockmap`;
const mutable = [
  'suite/latest.yml',
  'downloads/latest.yml',
  'downloads/QuizMate-Windows-Manual.pdf',
  'download.html',
  'index.html',
  'blog/article-exam-skills.html',
  'docs.html',
];

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const selected = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!selected?.access_key_id || !selected?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return selected;
}

function storage() {
  const selected = profile();
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    accessKeyId: selected.access_key_id,
    accessKeySecret: selected.access_key_secret,
    stsToken: selected.sts_token || undefined,
    timeout: 1_200_000,
  });
}

async function digest(client, object) {
  const response = await client.getStream(object);
  const sha256 = crypto.createHash('sha256');
  const sha512 = crypto.createHash('sha512');
  let size = 0;
  for await (const chunk of response.stream) {
    sha256.update(chunk);
    sha512.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') };
}

async function backup(client, object) {
  await client.head(object);
  const rollback = `rollback/${CHANGE_ID}/${object}`;
  try {
    await client.head(rollback);
    console.log(`BACKUP_KEEP ${rollback}`);
  } catch (error) {
    if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error;
    await client.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`BACKUP_OK ${object} -> ${rollback}`);
  }
}

async function restore(client) {
  for (const object of mutable) {
    try {
      await client.copy(object, `rollback/${CHANGE_ID}/${object}`, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`ROLLBACK_OK ${object}`);
    } catch (error) {
      console.error(`ROLLBACK_FAILED ${object}: ${error.message}`);
    }
  }
}

function local(name) {
  return fs.readFileSync(path.join(SITE, name), 'utf8');
}

async function main() {
  const client = storage();
  const source = await digest(client, `suite/${EXE}`);
  const sourceBlockmap = await digest(client, `suite/${BLOCKMAP}`);
  console.log(`SOURCE_OK suite/${EXE} size=${source.size} sha256=${source.sha256}`);
  console.log(`SOURCE_OK suite/${BLOCKMAP} size=${sourceBlockmap.size} sha256=${sourceBlockmap.sha256}`);
  const manifest = [
    `version: ${INTERNAL_VERSION}`,
    'files:',
    `  - url: ${EXE}`,
    `    sha512: ${source.sha512}`,
    `    size: ${source.size}`,
    `path: ${EXE}`,
    `sha512: ${source.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');
  for (const object of mutable) await backup(client, object);
  try {
    await client.copy(`downloads/${EXE}`, `suite/${EXE}`, { headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    await client.copy(`downloads/${BLOCKMAP}`, `suite/${BLOCKMAP}`, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    await client.put('suite/latest.yml', Buffer.from(manifest), { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    await client.put('downloads/latest.yml', Buffer.from(manifest), { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    for (const page of ['download.html', 'index.html', 'blog/article-exam-skills.html', 'docs.html']) {
      await client.put(page, Buffer.from(local(page)), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    }
    await client.put('downloads/QuizMate-Windows-Manual.pdf', fs.readFileSync(MANUAL), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  } catch (error) {
    await restore(client);
    throw error;
  }
  const copied = await digest(client, `downloads/${EXE}`);
  if (copied.sha256 !== source.sha256 || copied.size !== source.size) {
    await restore(client);
    throw new Error('Published Windows installer digest mismatch');
  }
  const remoteManifest = (await client.get('suite/latest.yml')).content.toString('utf8');
  if (!remoteManifest.includes(`version: ${INTERNAL_VERSION}`) || !remoteManifest.includes(EXE)) {
    await restore(client);
    throw new Error('Published latest.yml mismatch');
  }
  const manual = await digest(client, 'downloads/QuizMate-Windows-Manual.pdf');
  console.log(`PROMOTE_OK bucket=quizmate-cn internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION} exe_sha256=${copied.sha256} manual_sha256=${manual.sha256} rollback=rollback/${CHANGE_ID}/`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
