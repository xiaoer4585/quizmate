const fs = require('node:fs');
const path = require('node:path');
const OSS = require('../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const root = path.resolve(__dirname, '../../..');
const localFile = path.join(root, 'windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.9.4000.exe');
const objectName = 'temp/CHG-20260904-02/windows/QuizMate-Windows-2026.9.4000.exe';
const protectedObjects = ['suite/latest.yml', 'downloads/latest.yml', 'download.html', 'index.html'];

function loadProfile() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile is incomplete');
  return profile;
}

function createClient(profile) {
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

async function fingerprints(client) {
  const result = {};
  for (const key of protectedObjects) {
    const head = await client.head(key);
    result[key] = `${head.res.headers.etag || ''}:${head.res.headers['content-length'] || ''}`;
  }
  return result;
}

async function main() {
  if (!objectName.startsWith('temp/CHG-20260904-02/windows/')) throw new Error('Unsafe OSS target');
  const stat = fs.statSync(localFile);
  const client = createClient(loadProfile());
  const before = await fingerprints(client);
  const uploaded = await client.multipartUpload(objectName, localFile, {
    parallel: 8,
    partSize: 1024 * 1024,
    headers: {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Cache-Control': 'no-cache',
      'Content-Disposition': 'attachment; filename="QuizMate-Windows-2026.9.4000.exe"',
    },
  });
  if (uploaded.res.status !== 200) throw new Error(`Upload failed with HTTP ${uploaded.res.status}`);
  const head = await client.head(objectName);
  if (Number(head.res.headers['content-length']) !== stat.size) throw new Error('Uploaded size does not match local package');
  const after = await fingerprints(client);
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('A protected production object changed during test upload');
  process.stdout.write(`TEST_UPLOAD_OK object=${objectName} size=${stat.size}\n`);
  process.stdout.write('PRODUCTION_OBJECTS_UNCHANGED\n');
}

main().catch((error) => {
  console.error(`TEST_UPLOAD_FAILED ${error.code || ''} ${error.message}`);
  process.exitCode = 1;
});
