// 旧官网跳转脚本：
// quizmate.vip / www.quizmate.vip 的公开 HTML 页面统一跳到 www.quizmate.cn
// admin-web 保留在 vip 域名，不在这里处理。
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const TARGET_BASE = 'https://www.quizmate.cn';
const BUCKET = 'quizmate-vip';

function loadCredentials() {
  if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    return {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    };
  }

  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current);
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return {
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
  };
}

function collectRedirectPages() {
  const pages = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(SITE_ROOT, full).split(path.sep).join('/');
      if (rel === 'admin-web' || rel.startsWith('admin-web/')) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile() && path.extname(rel).toLowerCase() === '.html') {
        pages.push(rel);
      }
    }
  }
  walk(SITE_ROOT);
  return pages;
}

function redirectHtml(rel) {
  const target = rel === 'index.html' ? `${TARGET_BASE}/` : `${TARGET_BASE}/${rel}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>QuizMate</title><script>location.replace(${JSON.stringify(target)}+location.search+location.hash);</script></head><body></body></html>`;
}

async function main() {
  const credentials = loadCredentials();
  const client = new OSS({
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    cname: true,
    bucket: BUCKET,
    secure: true,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    timeout: 120_000,
  });

  const pages = collectRedirectPages();
  let ok = 0;
  for (const rel of pages) {
    await client.put(rel, Buffer.from(redirectHtml(rel), 'utf8'), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
    console.log(`REDIRECT_OK ${rel}`);
    ok++;
  }

  console.log(`LEGACY_REDIRECTS_OK files=${ok} target=${TARGET_BASE}`);
}

main().catch((error) => {
  console.error('LEGACY_REDIRECTS_FAIL', error.message);
  process.exitCode = 1;
});
