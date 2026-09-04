const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../../..');
const windowsRoot = path.join(workspaceRoot, 'windows客户端', 'QuizMate-Windows');
const releaseRoot = path.join(windowsRoot, 'release');
const packageName = 'QuizMate-Windows-2026.9.5001.exe';
const prefix = 'temp/windows-voice-search-2026.09.05.1/suite';
const files = [packageName, `${packageName}.blockmap`, 'latest.yml'];

const moduleRoots = [
  path.join(workspaceRoot, '注册登陆模块', '阿里云统一入口-study-auth-api', 'node_modules'),
  path.join(windowsRoot, 'node_modules'),
];
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadProfile() {
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) throw new Error('USERPROFILE is unavailable');
  const config = JSON.parse(fs.readFileSync(path.join(userProfile, '.aliyun', 'config.json'), 'utf8'));
  const selected = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!selected?.access_key_id || !selected?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return selected;
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

async function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(windowsRoot, 'package.json'), 'utf8'));
  const clientConfig = JSON.parse(fs.readFileSync(path.join(windowsRoot, 'resources', 'config.json'), 'utf8'));
  if (packageJson.version !== '2026.9.5001' || clientConfig.version !== '2026.09.05.1') {
    throw new Error('Unexpected Windows test version');
  }
  const manifest = fs.readFileSync(path.join(releaseRoot, 'latest.yml'), 'utf8');
  if (!manifest.includes('version: 2026.9.5001') || !manifest.includes(packageName)) {
    throw new Error('Test manifest does not match the test package');
  }

  const profile = loadProfile();
  const storage = new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined,
    timeout: 1_200_000,
  });

  for (const name of files) {
    const localFile = path.join(releaseRoot, name);
    if (!fs.existsSync(localFile)) throw new Error(`Missing test artifact: ${name}`);
    const object = `${prefix}/${name}`;
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': name.endsWith('.exe')
        ? 'application/vnd.microsoft.portable-executable'
        : name.endsWith('.yml') ? 'text/yaml; charset=utf-8' : 'application/octet-stream',
    };
    if (fs.statSync(localFile).size > 5 * 1024 * 1024) {
      await storage.multipartUpload(object, localFile, { parallel: 4, partSize: 10 * 1024 * 1024, headers });
    } else {
      await storage.put(object, localFile, { headers });
    }
    const remote = await digestObject(storage, object);
    const local = { size: fs.statSync(localFile).size, sha256: sha256File(localFile) };
    if (remote.size !== local.size || remote.sha256 !== local.sha256) {
      throw new Error(`Uploaded object mismatch: ${object}`);
    }
    process.stdout.write(`TEST_UPLOAD_OK ${object} size=${remote.size} sha256=${remote.sha256}\n`);
  }
  process.stdout.write(`TEST_DOWNLOAD_URL https://www.quizmate.cn/${prefix}/${packageName}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
