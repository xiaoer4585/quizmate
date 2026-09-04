const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const moduleRoots = [
  path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const INTERNAL_VERSION = '2026.9.5000';
const PUBLIC_VERSION = '2026.09.05';
const PREVIOUS_PUBLIC_VERSION = '2026.08.29';
const CHANGE_ID = 'CHG-20260905-01';

const names = {
  windowsExe: `QuizMate-Windows-${PUBLIC_VERSION}.exe`,
  windowsBlockmap: `QuizMate-Windows-${PUBLIC_VERSION}.exe.blockmap`,
};

const previousNames = {
  windowsExe: `QuizMate-Windows-${PREVIOUS_PUBLIC_VERSION}.exe`,
};

const sourceObjects = {
  windowsExe: `suite/${names.windowsExe}`,
  windowsBlockmap: `suite/${names.windowsBlockmap}`,
};

const mutableObjects = [
  'suite/latest.yml',
  'downloads/latest.yml',
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
    process.stdout.write(`BACKUP_KEEP ${rollback}\n`);
    return;
  } catch (error) {
    if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error;
  }
  await storage.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
  process.stdout.write(`BACKUP_OK ${object} -> ${rollback}\n`);
}

async function putText(storage, object, value, contentType) {
  await storage.put(object, Buffer.from(value, 'utf8'), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
  process.stdout.write(`UPLOAD_OK ${object}\n`);
}

function replaceOnce(value, from, to, label, required = true) {
  const count = value.split(from).length - 1;
  if (required && count < 1) throw new Error(`Missing website marker ${label}: ${from}`);
  if (count > 8) throw new Error(`Unexpectedly broad website marker ${label}: count=${count}`);
  return value.split(from).join(to);
}

function replaceWindowsCard(value) {
  const start = value.indexOf('data-platform-card="windows"');
  if (start < 0) throw new Error('Windows download card is missing');
  const end = value.indexOf('</article>', start);
  if (end < 0) throw new Error('Windows download card is incomplete');
  const before = value.slice(0, start);
  let card = value.slice(start, end);
  const after = value.slice(end);
  card = replaceOnce(card, previousNames.windowsExe, names.windowsExe, 'Windows download');
  card = replaceOnce(card, PREVIOUS_PUBLIC_VERSION, PUBLIC_VERSION, 'Windows card version');
  return before + card + after;
}

async function updatePages(storage) {
  const pages = {};
  for (const object of ['download.html', 'index.html', 'blog/article-exam-skills.html']) {
    pages[object] = (await storage.get(object)).content.toString('utf8');
  }
  pages['download.html'] = replaceWindowsCard(pages['download.html']);

  let index = pages['index.html'];
  index = replaceOnce(index, previousNames.windowsExe, names.windowsExe, 'home Windows download');
  pages['index.html'] = index;

  pages['blog/article-exam-skills.html'] = replaceOnce(
    pages['blog/article-exam-skills.html'], previousNames.windowsExe, names.windowsExe, 'article Windows download'
  );
  return pages;
}

async function restore(storage) {
  for (const object of mutableObjects) {
    try {
      await storage.copy(object, `rollback/${CHANGE_ID}/${object}`, { headers: { 'Cache-Control': 'no-cache' } });
      process.stdout.write(`ROLLBACK_OK ${object}\n`);
    } catch (error) {
      process.stderr.write(`ROLLBACK_FAILED ${object}: ${error.message}\n`);
    }
  }
}

async function main() {
  const storage = client(profile());
  const digests = {};
  for (const [key, object] of Object.entries(sourceObjects)) {
    digests[key] = await digestObject(storage, object);
    process.stdout.write(`SOURCE_HASH_OK ${object} size=${digests[key].size} sha256=${digests[key].sha256}\n`);
  }
  const pages = await updatePages(storage);
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
    for (const [object, value] of Object.entries(pages)) await putText(storage, object, value, 'text/html; charset=utf-8');
  } catch (error) {
    await restore(storage);
    throw error;
  }

  for (const object of mutableObjects) await storage.head(object);
  const copiedExe = await digestObject(storage, `downloads/${names.windowsExe}`);
  if (copiedExe.sha256 !== digests.windowsExe.sha256) {
    await restore(storage);
    throw new Error('Windows download copy digest mismatch');
  }
  process.stdout.write(`PROMOTE_OK internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION} bucket=quizmate-cn rollback=rollback/${CHANGE_ID}/\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
