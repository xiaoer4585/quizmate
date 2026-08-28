// 定向发布：首页演示视频面板（index.html + styles.css）到 quizmate.cn OSS
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

const FILES = [
  ['index.html', 'text/html; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8']
];

async function main() {
  const profile = aliyunProfile();
  const client = new OSS({
    region: REGION,
    endpoint: `https://${ENDPOINT}`,
    bucket: BUCKET,
    secure: true,
    timeout: 120000,
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || profile.access_key_id,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || profile.access_key_secret
  });
  for (const [rel, type] of FILES) {
    await client.put(rel, path.join(SITE_ROOT, rel), { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
    console.log('UPLOADED', rel);
  }
  for (const [rel] of FILES) {
    const head = await client.head(rel);
    console.log('VERIFY', rel, head.res.status, head.res.headers['content-length'] || '?');
  }
  console.log('DEPLOY_OK');
}

main().catch((error) => { console.error('DEPLOY_FAIL', error.message); process.exitCode = 1; });
