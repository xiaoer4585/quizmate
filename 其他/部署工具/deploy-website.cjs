// 20260807 官网全量部署：代码文件 + assets 图片到 OSS quizmate-vip
// 官网首页重构 + FAQ合并到guide + 去掉购买与咨询 + 浮动群聊二维码
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');

function loadCredentials() {
  if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    return {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    };
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
  );
  const profile = config.profiles.find((item) => item.name === config.current);
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return {
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
  };
}

const credentials = loadCredentials();
const client = new OSS({
  endpoint: 'https://www.quizmate.vip',
  cname: true,
  bucket: 'quizmate-vip',
  secure: true,
  accessKeyId: credentials.accessKeyId,
  accessKeySecret: credentials.accessKeySecret,
  timeout: 120_000,
});

// 顶层代码/文本文件（objectName, relativeFile, contentType）
const codeFiles = [
  ['index.html', 'index.html', 'text/html; charset=utf-8'],
  ['styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ['guide.html', 'guide.html', 'text/html; charset=utf-8'],
  ['docs.html', 'docs.html', 'text/html; charset=utf-8'],
  ['download.html', 'download.html', 'text/html; charset=utf-8'],
  ['recharge.html', 'recharge.html', 'text/html; charset=utf-8'],
  ['app.js', 'app.js', 'application/javascript; charset=utf-8'],
  ['credits.js', 'credits.js', 'application/javascript; charset=utf-8'],
  ['sitemap.xml', 'sitemap.xml', 'application/xml; charset=utf-8'],
  ['robots.txt', 'robots.txt', 'text/plain; charset=utf-8'],
  ['llms.txt', 'llms.txt', 'text/plain; charset=utf-8'],
  ['baidu_verify_codeva-fEW8nhfoB3.html', 'baidu_verify_codeva-fEW8nhfoB3.html', 'text/html; charset=utf-8'],
  ['WW_verify_c0b5Kdhx7G5xk36W.txt', 'WW_verify_c0b5Kdhx7G5xk36W.txt', 'text/plain; charset=utf-8'],
  ['downloads/QuizMate-Android-2026.07.31.apk', 'downloads/QuizMate-Android-2026.07.31.apk', 'application/vnd.android.package-archive'],
  ['downloads/QuizMate-Career-Extension-2.2.0.zip', 'downloads/QuizMate-Career-Extension-2.2.0.zip', 'application/zip'],
];

function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case '.html': case '.htm': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.xml': return 'application/xml; charset=utf-8';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.avif': return 'image/avif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.ico': return 'image/x-icon';
    case '.mp4': return 'video/mp4';
    default: return 'application/octet-stream';
  }
}

// 递归收集 assets/ 下的文件（排除 mp4 等大文件）
function collectAssets() {
  const result = [];
  const assetsDir = path.join(siteRoot, 'assets');
  if (!fs.existsSync(assetsDir)) return result;
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(siteRoot, full).split(path.sep).join('/');
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (ext === '.mp4') continue; // 跳过大视频
        result.push([rel, rel, contentTypeFor(ext)]);
      }
    }
  }
  walk(assetsDir);
  return result;
}

function collectPublicFiles() {
  const result = [];
  const rootFiles = new Set([
    'index.html', 'blog.html', 'guide.html', 'docs.html', 'download.html', 'recharge.html', 'purchase.html', 'faq.html',
    'ai-written-test-assistant.html', 'ai-interview-assistant.html', 'campus-recruitment-ai-assistant.html', 'career-ai-tools.html',
    'about.html', 'privacy.html', 'security.html', 'changelog.html',
    'styles.css', 'seo-pages.css', 'app.js', 'credits.js', 'sitemap.xml', 'robots.txt', 'llms.txt',
    'baidu_verify_codeva-fEW8nhfoB3.html', 'WW_verify_c0b5Kdhx7G5xk36W.txt',
  ]);
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(siteRoot, full).split(path.sep).join('/');
      if (rel === 'admin-web' || rel.startsWith('admin-web/') || rel === 'downloads' || rel.startsWith('downloads/') || rel === 'assets' || rel.startsWith('assets/')) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && (rootFiles.has(rel) || (rel.startsWith('blog/') && rel.endsWith('.html')))) {
        result.push([rel, rel, contentTypeFor(path.extname(name))]);
      }
    }
  }
  walk(siteRoot);
  return result;
}

async function put(objectName, relativeFile, contentType) {
  const file = path.join(siteRoot, relativeFile);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const result = await client.put(objectName, file, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed for ${objectName}: status ${result.res.status}`);
  process.stdout.write(`PUT_OK ${objectName} ${fs.statSync(file).size} bytes\n`);
}

async function main() {
  const assets = collectAssets();
  const publicFiles = collectPublicFiles();
  const unique = new Map([...codeFiles, ...publicFiles, ...assets].map(entry => [entry[0], entry]));
  const all = [...unique.values()];
  process.stdout.write(`DEPLOY_START total=${all.length} (code=${codeFiles.length}, assets=${assets.length})\n`);

  let ok = 0;
  let fail = 0;
  for (const [obj, rel, ct] of all) {
    try {
      await put(obj, rel, ct);
      ok++;
    } catch (e) {
      fail++;
      process.stderr.write(`PUT_FAIL ${obj} ${e.message}\n`);
    }
  }

  // 抽样验证关键文件
  process.stdout.write('--- VERIFY ---\n');
  for (const obj of ['index.html', 'styles.css', 'guide.html', 'download.html', 'recharge.html']) {
    try {
      const head = await client.head(obj);
      const len = head.res.headers['content-length'] || '?';
      process.stdout.write(`VERIFY ${obj}: ${len} bytes\n`);
    } catch (e) {
      process.stderr.write(`VERIFY_FAIL ${obj} ${e.message}\n`);
    }
  }

  process.stdout.write(`DEPLOY_COMPLETE ok=${ok} fail=${fail}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAIL ${error.name || ''} ${error.status || ''} ${error.code || ''} ${error.message}\n`);
  process.exitCode = 1;
});
