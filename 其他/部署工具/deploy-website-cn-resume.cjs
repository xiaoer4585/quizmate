// Upload the corrected docs.html and all other website files to the quizmate-cn
// OSS bucket using the same logic as deploy-website-cn.cjs, but with longer
// timeouts and a fallback for large downloads/* files.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
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
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.dmg': 'application/x-apple-diskimage', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })[ext] || 'application/octet-stream';
}

function collectFiles() {
  const files = [];
  const rootAllow = new Set(['index.html', 'blog.html', 'guide.html', 'docs.html', 'download.html', 'recharge.html', 'purchase.html', 'faq.html', 'ai-written-test-assistant.html', 'ai-interview-assistant.html', 'campus-recruitment-ai-assistant.html', 'career-ai-tools.html', 'about.html', 'privacy.html', 'security.html', 'changelog.html', 'styles.css', 'seo-pages.css', 'app.js', 'credits.js', 'sitemap.xml', 'robots.txt', 'llms.txt', 'baidu_verify_codeva-fEW8nhfoB3.html', 'baidu_verify_codeva-vOYzkM3klZ.html', 'WW_verify_c0b5Kdhx7G5xk36W.txt']);
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(SITE_ROOT, full).split(path.sep).join('/');
      if (rel === 'admin-web' || rel.startsWith('admin-web/')) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (rel.startsWith('assets/') || rel.startsWith('downloads/') || rel.startsWith('mac/') || rootAllow.has(rel) || (rel.startsWith('blog/') && rel.endsWith('.html'))) files.push([rel, full]);
    }
  }
  walk(SITE_ROOT);
  return files;
}

async function putWithRetry(client, rel, file, headers, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.put(rel, file, { headers, timeout: 600000 });
      return;
    } catch (err) {
      lastErr = err;
      console.error(`UPLOAD_RETRY ${i}/${attempts} ${rel}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

async function main() {
  const profile = aliyunProfile();
  const client = new OSS({
    region: REGION,
    endpoint: `https://${ENDPOINT}`,
    bucket: BUCKET,
    secure: true,
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || profile.access_key_id,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || profile.access_key_secret,
    timeout: 600000,
  });

  const all = collectFiles();
  // Sort: small/text files first so docs.html and other UI land before the
  // large dmg/exe artifacts; gives a fast visible fix and avoids choking on
  // the huge installers.
  all.sort((a, b) => fs.statSync(a[1]).size - fs.statSync(b[1]).size);

  let ok = 0;
  for (const [rel, file] of all) {
    await putWithRetry(client, rel, file, { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' });
    ok++;
    if (rel === 'docs.html' || rel === 'index.html' || ok % 20 === 0) {
      console.log(`UPLOADED ${ok}/${all.length} ${rel}`);
    }
  }
  console.log(`DEPLOY_OK bucket=${BUCKET} files=${ok}`);

  for (const rel of ['docs.html', 'index.html', 'app.js']) {
    try {
      const head = await client.head(rel);
      console.log(`VERIFY ${rel} ${head.res.status} ${head.res.headers['content-length'] || '?'}`);
    } catch (err) {
      console.error(`VERIFY_FAIL ${rel}: ${err.message}`);
    }
  }
}

main().catch((error) => { console.error('DEPLOY_FAIL', error.message); process.exitCode = 1; });
