const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const PUBLIC_BUCKET = 'quizmate-vip';
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = cfg.profiles.find((item) => item.name === (cfg.current || 'default')) || cfg.profiles[0];
const client = new OSS({ endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: PUBLIC_BUCKET, secure: true, accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || profile.access_key_id, accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || profile.access_key_secret });

function htmlFor(rel) {
  const target = rel === 'index.html' ? 'https://www.quizmate.cn/' : `https://www.quizmate.cn/${rel}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>QuizMate</title><script>location.replace(${JSON.stringify(target)}+location.search+location.hash);</script></head><body></body></html>`;
}
async function main() {
  // VIP is a legacy traffic entry only. Keep the root redirect and the admin-web entry untouched.
  const rel = 'index.html';
  await client.put(rel, Buffer.from(htmlFor(rel), 'utf8'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  console.log('LEGACY_ROOT_REDIRECT_OK files=1');
}
main().catch((error) => { console.error('LEGACY_REDIRECTS_FAIL', error.message); process.exitCode = 1; });
