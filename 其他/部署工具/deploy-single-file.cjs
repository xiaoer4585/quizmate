// Upload a single file (relative to SITE_ROOT) to the quizmate-cn OSS bucket
// with overwrite. Used to refresh docs.html after a content tweak without
// paying for the full site resync.
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const BUCKET = 'quizmate-cn';
const REGION = 'cn-beijing';
const ENDPOINT = 'oss-cn-beijing.aliyuncs.com';

function aliyunProfile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  return config.profiles.find((item) => item.name === (config.current || 'default')) || config.profiles[0];
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' })[ext] || 'application/octet-stream';
}

const target = process.argv[2] || 'docs.html';

async function main() {
  const profile = aliyunProfile();
  const client = new OSS({
    region: REGION,
    endpoint: `https://${ENDPOINT}`,
    bucket: BUCKET,
    secure: true,
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || profile.access_key_id,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || profile.access_key_secret,
    timeout: 1800000,
  });

  const file = path.join(SITE_ROOT, target);
  await client.put(target, file, { headers: { 'Content-Type': contentType(target), 'Cache-Control': 'no-cache' }, timeout: 600000 });
  const head = await client.head(target);
  console.log(`UPLOADED ${target} size=${head.res.headers['content-length']}`);
}

main().catch((error) => { console.error('UPLOAD_FAIL', error.message); process.exitCode = 1; });
