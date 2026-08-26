const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const VERSION = '2026.8.28';
const CHANGE_ID = 'CHG-20260822-07';
const OBJECTS = [
  `downloads/QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`,
  `downloads/QuizMate-Mac-Intel-${VERSION}.dmg`,
  `mac/QuizMate-Mac-arm64-${VERSION}.zip`,
  `mac/QuizMate-Mac-x64-${VERSION}.zip`,
];
const CONTENT_TYPES = {
  dmg: 'application/x-apple-diskimage',
  zip: 'application/zip',
};

const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];

function client(bucket) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket,
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined,
    timeout: 1200000,
  });
}

function contentType(object) {
  return CONTENT_TYPES[path.extname(object).slice(1)] || 'application/octet-stream';
}

async function exists(storage, object) {
  try {
    return await storage.head(object);
  } catch (error) {
    if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return null;
    throw error;
  }
}

async function syncObject(source, target, object) {
  const sourceHead = await source.head(object);
  const oldTarget = await exists(target, object);
  const sourceSize = Number(sourceHead.res.headers['content-length']);
  if (oldTarget && Number(oldTarget.res.headers['content-length']) === sourceSize) {
    console.log(`SKIP ${object} already synchronized ${sourceSize}`);
    return;
  }
  if (oldTarget) await target.copy(`rollback/${CHANGE_ID}/${object}`, object);

  const response = await source.getStream(object);
  await target.putStream(object, response.stream, {
    headers: {
      'Content-Type': contentType(object),
      'Cache-Control': 'no-cache',
    },
  });

  const targetHead = await target.head(object);
  const targetSize = Number(targetHead.res.headers['content-length']);
  if (sourceSize !== targetSize) throw new Error(`size mismatch for ${object}: ${sourceSize} != ${targetSize}`);
  console.log(`SYNCED ${object} ${sourceSize}`);
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

async function publishManifest(storage, manifest) {
  const object = 'mac/latest-mac.yml';
  if (await exists(storage, object)) await storage.copy(`rollback/${CHANGE_ID}/${object}`, object);
  await storage.put(object, Buffer.from(manifest, 'utf8'), {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
  const readBack = await storage.get(object);
  if (readBack.content.toString('utf8') !== manifest) throw new Error(`manifest mismatch in ${storage.options.bucket}`);
  console.log(`PUBLISHED ${storage.options.bucket}/${object}`);
}

async function main() {
  const primary = client('quizmate-cn');
  const armObject = `mac/QuizMate-Mac-arm64-${VERSION}.zip`;
  const x64Object = `mac/QuizMate-Mac-x64-${VERSION}.zip`;
  const [arm, x64] = await Promise.all([
    digestObject(primary, armObject),
    digestObject(primary, x64Object),
  ]);
  const releaseDate = new Date().toISOString();
  const manifest = [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${path.basename(armObject)}`,
    `    sha512: ${arm.sha512}`,
    `    size: ${arm.size}`,
    `  - url: ${path.basename(x64Object)}`,
    `    sha512: ${x64.sha512}`,
    `    size: ${x64.size}`,
    `path: ${path.basename(armObject)}`,
    `sha512: ${arm.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');

  await publishManifest(primary, manifest);
  console.log(manifest);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
