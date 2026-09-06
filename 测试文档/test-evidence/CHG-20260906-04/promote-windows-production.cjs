const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const moduleRoots = [
  path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const INTERNAL_VERSION = '2026.9.6000';
const PUBLIC_VERSION = '2026.09.06';
const PREVIOUS_PUBLIC_VERSION = '2026.09.05.1';
const CHANGE_ID = 'CHG-20260906-04';
const ROOT = path.resolve(__dirname, '../../..');
const MANUAL = path.join(
  ROOT,
  '运营管理',
  '产品交付与宣传资料',
  '学习悬浮助手操作手册.pdf',
);

const names = {
  windowsExe: `QuizMate-Windows-${PUBLIC_VERSION}.exe`,
  windowsBlockmap: `QuizMate-Windows-${PUBLIC_VERSION}.exe.blockmap`,
};
const previousExe = `QuizMate-Windows-${PREVIOUS_PUBLIC_VERSION}.exe`;
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
  'downloads/QuizMate-Windows-Manual.pdf',
];

function profile() {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
  );
  const selected = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!selected?.access_key_id || !selected?.access_key_secret) {
    throw new Error('Aliyun profile is incomplete');
  }
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

async function put(storage, object, value, contentType, cacheControl) {
  await storage.put(object, value, {
    headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl },
  });
  process.stdout.write(`UPLOAD_OK ${object}\n`);
}

function replaceChecked(value, from, to, label) {
  const count = value.split(from).length - 1;
  if (count < 1 || count > 8) throw new Error(`Unexpected ${label} marker count=${count}`);
  return value.split(from).join(to);
}

function replaceWindowsCard(value) {
  const start = value.indexOf('data-platform-card="windows"');
  const end = value.indexOf('</article>', start);
  if (start < 0 || end < 0) throw new Error('Windows download card is missing or incomplete');
  let card = value.slice(start, end);
  card = card.replace(
    /QuizMate-Windows-2026\.09\.05(?:\.1){0,2}\.exe/g,
    names.windowsExe,
  );
  card = card.replace(
    /(<li><span>版本<\/span><strong>)2026\.09\.05(?:\.1){0,2}(<\/strong><\/li>)/,
    `$1${PUBLIC_VERSION}$2`,
  );
  if (!card.includes(names.windowsExe) || !card.includes(`>${PUBLIC_VERSION}</strong>`)) {
    throw new Error('Windows download card update did not reach the expected version');
  }
  return value.slice(0, start) + card + value.slice(end);
}

async function updatedPages(storage) {
  const pages = {};
  for (const object of ['download.html', 'index.html', 'blog/article-exam-skills.html']) {
    pages[object] = (await storage.get(object)).content.toString('utf8');
  }
  pages['download.html'] = replaceWindowsCard(pages['download.html']);
  for (const object of ['index.html', 'blog/article-exam-skills.html']) {
    pages[object] = pages[object].replace(
      /QuizMate-Windows-2026\.09\.05(?:\.1){0,2}\.exe/g,
      names.windowsExe,
    );
    if (!pages[object].includes(names.windowsExe)) {
      throw new Error(`${object} did not reach the expected Windows version`);
    }
  }
  return pages;
}

async function restore(storage) {
  for (const object of mutableObjects) {
    try {
      await storage.copy(object, `rollback/${CHANGE_ID}/${object}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      process.stdout.write(`ROLLBACK_OK ${object}\n`);
    } catch (error) {
      process.stderr.write(`ROLLBACK_FAILED ${object}: ${error.message}\n`);
    }
  }
}

async function main() {
  if (!fs.existsSync(MANUAL)) throw new Error(`Manual not found: ${MANUAL}`);
  const storage = client(profile());
  const digests = {};
  for (const [key, object] of Object.entries(sourceObjects)) {
    digests[key] = await digestObject(storage, object);
    process.stdout.write(
      `SOURCE_HASH_OK ${object} size=${digests[key].size} sha256=${digests[key].sha256}\n`,
    );
  }
  const pages = await updatedPages(storage);
  const releaseDate = new Date().toISOString();
  const manifest = [
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
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    await storage.copy(`downloads/${names.windowsBlockmap}`, sourceObjects.windowsBlockmap, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    await put(storage, 'suite/latest.yml', Buffer.from(manifest), 'text/yaml; charset=utf-8', 'no-cache, no-store, must-revalidate');
    await put(storage, 'downloads/latest.yml', Buffer.from(manifest), 'text/yaml; charset=utf-8', 'no-cache, no-store, must-revalidate');
    for (const [object, value] of Object.entries(pages)) {
      await put(storage, object, Buffer.from(value), 'text/html; charset=utf-8', 'no-cache, no-store, must-revalidate');
    }
    await put(
      storage,
      'downloads/QuizMate-Windows-Manual.pdf',
      fs.readFileSync(MANUAL),
      'application/pdf',
      'no-cache, no-store, must-revalidate',
    );
  } catch (error) {
    await restore(storage);
    throw error;
  }

  const copiedExe = await digestObject(storage, `downloads/${names.windowsExe}`);
  if (copiedExe.sha256 !== digests.windowsExe.sha256) {
    await restore(storage);
    throw new Error('Windows download copy digest mismatch');
  }
  const manualDigest = await digestObject(storage, 'downloads/QuizMate-Windows-Manual.pdf');
  process.stdout.write(
    `PROMOTE_OK internal=${INTERNAL_VERSION} public=${PUBLIC_VERSION} exe_sha256=${copiedExe.sha256} manual_sha256=${manualDigest.sha256} rollback=rollback/${CHANGE_ID}/\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
