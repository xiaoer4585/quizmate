// QuizMate 测试包隔离上传脚本
//
// 用途：把 GitHub Releases 的最新测试构建（windows-build-manual-18 / mac-build-manual-26）
// 上传到阿里云 quizmate-cn 桶的 temp/quizmate-test-20260828/ 隔离目录，绝不覆盖
// suite/latest.yml / downloads/latest.yml / mac/latest-mac.yml / 官网 HTML，避免向已安装
// 的正式版用户推送更新提示。脚本不会调用任何 sync，需要时人工再切回正式发布。
//
// 用法：
//   node 其他/部署工具/deploy-test-isolated-20260828.cjs
//
// 环境要求：
//   USERPROFILE/.aliyun/config.json 提供 access_key_id / access_key_secret
//   ../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss
//   ../windows客户端/QuizMate-Windows/releases/2026-08-28-test/ （exe/blockmap/latest.yml）
//   ../mac客户端/QuizMate-Mac/releases/2026-08-28-test/ （arm64/x64 dmg + zip）

const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const BUCKET = 'quizmate-cn';
const ENDPOINT = 'https://oss-cn-beijing.aliyuncs.com';
const PREFIX = 'temp/quizmate-test-20260828';
const ROLLBACK = 'rollback/CHG-20260828-test-isolated';

const OBJECTS = [
  // Windows 测试包
  [`${PREFIX}/windows/QuizMate-Windows-2026.8.28.exe`,
      path.join(ROOT, 'windows客户端/QuizMate-Windows/releases/2026-08-28-test/QuizMate-Windows-2026.8.28.exe'),
      'application/vnd.microsoft.portable-executable'],
  [`${PREFIX}/windows/QuizMate-Windows-2026.8.28.exe.blockmap`,
      path.join(ROOT, 'windows客户端/QuizMate-Windows/releases/2026-08-28-test/QuizMate-Windows-2026.8.28.exe.blockmap'),
      'application/octet-stream'],
  [`${PREFIX}/windows/latest.yml`,
      path.join(ROOT, 'windows客户端/QuizMate-Windows/releases/2026-08-28-test/latest.yml'),
      'text/yaml; charset=utf-8'],

  // Mac 测试包（双架构）
  [`${PREFIX}/mac/QuizMate-Mac-arm64-2026.8.28.dmg`,
      path.join(ROOT, 'mac客户端/QuizMate-Mac/releases/2026-08-28-test/QuizMate-Mac-arm64-2026.8.28.dmg'),
      'application/x-apple-diskimage'],
  [`${PREFIX}/mac/QuizMate-Mac-x64-2026.8.28.dmg`,
      path.join(ROOT, 'mac客户端/QuizMate-Mac/releases/2026-08-28-test/QuizMate-Mac-x64-2026.8.28.dmg'),
      'application/x-apple-diskimage'],
  [`${PREFIX}/mac/QuizMate-2026.8.28-arm64-mac.zip`,
      path.join(ROOT, 'mac客户端/QuizMate-Mac/releases/2026-08-28-test/QuizMate-2026.8.28-arm64-mac.zip'),
      'application/zip'],
  [`${PREFIX}/mac/QuizMate-2026.8.28-mac.zip`,
      path.join(ROOT, 'mac客户端/QuizMate-Mac/releases/2026-08-28-test/QuizMate-2026.8.28-mac.zip'),
      'application/zip'],
];

function profile() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const value = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!value?.access_key_id || !value?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return value;
}

function client(p) {
  return new OSS({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    secure: true,
    accessKeyId: p.access_key_id,
    accessKeySecret: p.access_key_secret,
    stsToken: p.sts_token || undefined,
    timeout: 1_200_000,
  });
}

async function put(storage, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  const result = await storage.multipartUpload(object, file, {
    parallel: 8,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  const head = await storage.head(object);
  console.log(`UPLOAD_OK ${object} size=${head.res.headers['content-length'] || '?'}`);
}

async function verifyIsolated(storage) {
  // 确认没污染正式目录
  for (const protectedKey of [
    'suite/latest.yml',
    'downloads/latest.yml',
    'mac/latest-mac.yml',
    'download.html',
    'index.html',
  ]) {
    try {
      await storage.head(protectedKey);
    } catch (error) {
      throw new Error(`[verify] expected existing key ${protectedKey} to remain intact: ${error.message}`);
    }
  }
  for (const protectedKey of [
    `suite/QuizMate-Windows-2026.8.23.exe`,
    `downloads/QuizMate-Windows-2026.8.23.exe`,
  ]) {
    try {
      await storage.head(protectedKey);
      console.log(`KEEP_OK ${protectedKey}`);
    } catch (error) {
      if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') continue;
      throw error;
    }
  }
  for (const tempKey of [
    `${PREFIX}/windows/latest.yml`,
    `${PREFIX}/mac/QuizMate-Mac-arm64-2026.8.28.dmg`,
  ]) {
    await storage.head(tempKey);
  }
  console.log(`[verify] production mapping preserved, isolated objects present under ${PREFIX}/`);
}

async function main() {
  const p = profile();
  const storage = client(p);
  console.log(`[deploy-test-isolated] bucket=${BUCKET} prefix=${PREFIX} rollback=${ROLLBACK}`);
  for (const [object, file, contentType] of OBJECTS) {
    await put(storage, object, file, contentType);
  }
  await verifyIsolated(storage);
  console.log(`DEPLOY_TEST_ISOLATED_OK prefix=${PREFIX}`);
}

main().catch((error) => {
  console.error(`DEPLOY_TEST_ISOLATED_FAILED ${error.code || ''} ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});