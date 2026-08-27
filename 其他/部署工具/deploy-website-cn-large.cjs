// Upload the corrected docs.html and the remaining website files to the
// quizmate-cn OSS bucket. Skips media assets already uploaded by
// deploy-website-cn-resume.cjs so we can finish quickly. The earlier script
// made it through ~140/150 small files before timing out on a 257 MB mp4;
// this script focuses on the larger files with multipart upload + longer
// timeout.
const fs = require('fs');
const path = require('path');
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
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.dmg': 'application/x-apple-diskimage', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.mp4': 'video/mp4', '.avif': 'image/avif' })[ext] || 'application/octet-stream';
}

function collectFiles() {
  const files = [];
  const rootAllow = new Set(['index.html', 'blog.html', 'guide.html', 'docs.html', 'download.html', 'recharge.html', 'purchase.html', 'faq.html', 'ai-written-test-assistant.html', 'ai-interview-assistant.html', 'campus-recruitment-ai-assistant.html', 'career-ai-tools.html', 'about.html', 'privacy.html', 'security.html', 'changelog.html', 'styles.css', 'seo-pages.css', 'app.js', 'credits.js', 'sitemap.xml', 'sitemap-cn.xml', 'robots.txt', 'robots-cn.txt', 'llms.txt', 'llms-full.txt', 'pricing.md', 'baidu_verify_codeva-fEW8nhfoB3.html', 'baidu_verify_codeva-vOYzkM3klZ.html', 'WW_verify_c0b5Kdhx7G5xk36W.txt']);
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(SITE_ROOT, full).split(path.sep).join('/');
      if (rel === 'admin-web' || rel.startsWith('admin-web/')) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (rel.startsWith('assets/') || rel.startsWith('downloads/') || rel.startsWith('mac/') || rootAllow.has(rel) || (rel.startsWith('blog/') && rel.endsWith('.html'))) files.push([rel, full, stat.size]);
    }
  }
  walk(SITE_ROOT);
  return files;
}

async function uploadBigFile(client, rel, file, headers, partSize) {
  // ali-oss supports a "stream" PUT by default for large files via multipart
  // internally. We bump partSize + parallel to push the 200MB+ mp4s through
  // in fewer round-trips, and the SDK picks up the configured client timeout.
  await client.put(rel, file, {
    headers,
    timeout: 1800000,
    partSize,
    parallel: 4,
  });
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
    timeout: 1800000,
  });

  const all = collectFiles();
  // Big files first; >= 50MB use larger part size for fewer round-trips.
  const sorted = all.slice().sort((a, b) => b[2] - a[2]);

  let ok = 0;
  for (const [rel, file, size] of sorted) {
    const headers = { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' };
    const partSize = size >= 100 * 1024 * 1024 ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    try {
      await uploadBigFile(client, rel, file, headers, partSize);
      ok++;
      console.log(`UPLOADED ${ok}/${sorted.length} ${(size / 1024 / 1024).toFixed(2)}MB ${rel}`);
    } catch (err) {
      console.error(`UPLOAD_FAIL ${rel}: ${err.message}`);
      throw err;
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
