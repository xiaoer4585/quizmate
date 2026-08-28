const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const moduleRoots = [
  path.resolve(__dirname, '../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const ROOT = path.resolve(__dirname, '../..');
const INTERNAL_VERSION = '2026.8.29000';
const PUBLIC_VERSION = '2026.08.29';
const CHANGE_ID = 'CHG-20260829-01';
const SITE_ROOT = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const RELEASE_ROOT = path.resolve(process.env.QUIZMATE_RELEASE_DIR || path.join(ROOT, '_build/releases/2026.08.29'));

const names = {
  windowsExe: `QuizMate-Windows-${PUBLIC_VERSION}.exe`,
  windowsBlockmap: `QuizMate-Windows-${PUBLIC_VERSION}.exe.blockmap`,
  macArmDmg: `QuizMate-Mac-Apple-Silicon-${PUBLIC_VERSION}.dmg`,
  macIntelDmg: `QuizMate-Mac-Intel-${PUBLIC_VERSION}.dmg`,
  macArmZip: `QuizMate-Mac-arm64-${PUBLIC_VERSION}.zip`,
  macIntelZip: `QuizMate-Mac-x64-${PUBLIC_VERSION}.zip`,
};

const sourceObjects = {
  windowsExe: `suite/${names.windowsExe}`,
  windowsBlockmap: `suite/${names.windowsBlockmap}`,
  macArmDmg: `downloads/${names.macArmDmg}`,
  macIntelDmg: `downloads/${names.macIntelDmg}`,
  macArmZip: `mac/${names.macArmZip}`,
  macIntelZip: `mac/${names.macIntelZip}`,
};

const mutableObjects = [
  'suite/latest.yml',
  'downloads/latest.yml',
  'mac/latest-mac.yml',
  'download.html',
  'index.html',
  'blog/article-exam-skills.html',
];

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const selected = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!selected?.access_key_id || !selected?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return selected;
}

function client(selected) {
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

function findUnique(name) {
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name === name) matches.push(full);
    }
  };
  visit(RELEASE_ROOT);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${name}, found ${matches.length}`);
  return matches[0];
}

async function digestObject(storage, object) {
  const response = await storage.getStream(object);
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

async function backup(storage, object) {
  await storage.head(object);
  const rollback = `rollback/${CHANGE_ID}/${object}`;
  try {
    await storage.head(rollback);
    console.log(`BACKUP_KEEP ${rollback}`);
    return;
  } catch (error) {
    if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error;
  }
  await storage.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`BACKUP_OK ${object} -> ${rollback}`);
}

async function putText(storage, object, text, contentType) {
  await storage.put(object, Buffer.from(text, 'utf8'), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
  console.log(`UPLOAD_OK ${object}`);
}

async function restoreMutable(storage) {
  for (const object of mutableObjects) {
    try {
      await storage.copy(object, `rollback/${CHANGE_ID}/${object}`, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`ROLLBACK_OK ${object}`);
    } catch (error) {
      console.error(`ROLLBACK_FAILED ${object}: ${error.message}`);
    }
  }
}

function readPage(relative, markers) {
  const html = fs.readFileSync(path.join(SITE_ROOT, relative), 'utf8');
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error(`Missing website marker ${marker} in ${relative}`);
  }
  return html;
}

async function main() {
  const latestFile = findUnique('latest.yml');
  const windowsSourceManifest = fs.readFileSync(latestFile, 'utf8');
  if (!windowsSourceManifest.includes(`version: ${INTERNAL_VERSION}`) || !windowsSourceManifest.includes(names.windowsExe)) {
    throw new Error('Windows update manifest version or filename mismatch');
  }
  const pages = {
    'download.html': readPage('download.html', [PUBLIC_VERSION, names.windowsExe, names.macArmDmg, names.macIntelDmg]),
    'index.html': readPage('index.html', [names.windowsExe, names.macArmDmg, names.macIntelDmg]),
    'blog/article-exam-skills.html': readPage('blog/article-exam-skills.html', [names.windowsExe]),
  };

  const storage = client(profile());
  const digests = {};
  for (const [key, object] of Object.entries(sourceObjects)) {
    digests[key] = await digestObject(storage, object);
    console.log(`SOURCE_HASH_OK ${object} size=${digests[key].size} sha256=${digests[key].sha256}`);
  }

  const releaseDate = new Date().toISOString();
  const windowsManifest = [
    `version: ${INTERNAL_VERSION}`,
    'files:',
    `  - url: ${names.windowsExe}`,
    `    sha512: ${digests.windowsExe.sha512}`,
    `    size: ${digests.windowsExe.size}`,
    `path: ${names.windowsExe}`,
    `sha512: ${digests.windowsExe.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');

  const macManifest = [
    `version: ${INTERNAL_VERSION}`,
    'files:',
    `  - url: ${names.macArmZip}`,
    `    sha512: ${digests.macArmZip.sha512}`,
    `    size: ${digests.macArmZip.size}`,
    `  - url: ${names.macIntelZip}`,
    `    sha512: ${digests.macIntelZip.sha512}`,
    `    size: ${digests.macIntelZip.size}`,
    `path: ${names.macArmZip}`,
    `sha512: ${digests.macArmZip.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');

  for (const object of mutableObjects) await backup(storage, object);
  try {
    await storage.copy(`downloads/${names.windowsExe}`, sourceObjects.windowsExe, {
      headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
    await storage.copy(`downloads/${names.windowsBlockmap}`, sourceObjects.windowsBlockmap, {
      headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
    await putText(storage, 'suite/latest.yml', windowsManifest, 'text/yaml; charset=utf-8');
    await putText(storage, 'downloads/latest.yml', windowsManifest, 'text/yaml; charset=utf-8');
    await putText(storage, 'mac/latest-mac.yml', macManifest, 'text/yaml; charset=utf-8');
    for (const [object, html] of Object.entries(pages)) await putText(storage, object, html, 'text/html; charset=utf-8');
  } catch (error) {
    await restoreMutable(storage);
    throw error;
  }

  const copiedExe = await digestObject(storage, `downloads/${names.windowsExe}`);
  const copiedBlockmap = await digestObject(storage, `downloads/${names.windowsBlockmap}`);
  if (copiedExe.sha256 !== digests.windowsExe.sha256 || copiedBlockmap.sha256 !== digests.windowsBlockmap.sha256) {
    await restoreMutable(storage);
    throw new Error('Windows downloads copy digest mismatch');
  }
  for (const object of mutableObjects) {
    const head = await storage.head(object);
    console.log(`VERIFY_OBJECT_OK ${object} size=${head.res.headers['content-length']}`);
  }
  console.log(`DEPLOY_DESKTOP_RELEASE_OK internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION} bucket=quizmate-cn`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
