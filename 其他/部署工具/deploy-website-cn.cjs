// Deploy the public QuizMate website to an isolated bucket for www.quizmate.cn.
// admin-web, legacy backend files, and private operational material are excluded.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const BUCKET = 'quizmate-cn';
const REGION = 'cn-beijing';
const ENDPOINT = 'oss-cn-beijing.aliyuncs.com';
const DOMAIN = 'www.quizmate.cn';
const CERT_ID = process.env.QUIZMATE_OSS_CERT_ID || '';

function cli(args) {
  return execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function aliyunProfile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  return config.profiles.find((item) => item.name === (config.current || 'default')) || config.profiles[0];
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.dmg': 'application/x-apple-diskimage', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })[ext] || 'application/octet-stream';
}

function collectFiles() {
  const files = [];
  const rootAllow = new Set(['index.html', 'blog.html', 'guide.html', 'docs.html', 'download.html', 'recharge.html', 'purchase.html', 'faq.html', 'ai-written-test-assistant.html', 'ai-interview-assistant.html', 'campus-recruitment-ai-assistant.html', 'career-ai-tools.html', 'about.html', 'privacy.html', 'security.html', 'changelog.html', 'styles.css', 'seo-pages.css', 'app.js', 'credits.js', 'sitemap.xml', 'sitemap-cn.xml', 'robots.txt', 'robots-cn.txt', 'llms.txt', 'llms-full.txt', 'pricing.md', 'baidu_verify_codeva-fEW8nhfoB3.html', 'baidu_verify_codeva-vOYzkM3klZ.html', 'WW_verify_c0b5Kdhx7G5xk36W.txt']);
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(SITE_ROOT, full).split(path.sep).join('/');
      if (rel === 'admin-web' || rel.startsWith('admin-web/')) continue;
      // Client update manifests are release-state objects. A static website
      // sync must never replace them with a checked-in historical snapshot.
      if (rel === 'mac/latest-mac.yml' || rel === 'downloads/latest.yml' || rel === 'suite/latest.yml') continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (rel.startsWith('assets/') || rel.startsWith('downloads/') || rel.startsWith('mac/') || rootAllow.has(rel) || (rel.startsWith('blog/') && rel.endsWith('.html'))) files.push([rel, full]);
    }
  }
  walk(SITE_ROOT);
  return files;
}

async function main() {
  const profile = aliyunProfile();
  const client = new OSS({ region: REGION, endpoint: `https://${ENDPOINT}`, bucket: BUCKET, secure: true, accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || profile.access_key_id, accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || profile.access_key_secret });
  try { cli(['oss', 'mb', `oss://${BUCKET}`, '--endpoint', ENDPOINT]); console.log('BUCKET_CREATED'); } catch (error) { console.log('BUCKET_EXISTS_OR_CREATE_SKIPPED'); }
  try {
    cli(['oss', 'set-acl', `oss://${BUCKET}`, 'public-read', '--bucket', '--endpoint', ENDPOINT]);
  } catch (error) {
    const params = client._bucketRequestParams('PUT', BUCKET, 'publicAccessBlock', {});
    params.content = '<PublicAccessBlockConfiguration><BlockPublicAccess>false</BlockPublicAccess></PublicAccessBlockConfiguration>';
    params.successStatuses = [200];
    await client.request(params);
    cli(['oss', 'set-acl', `oss://${BUCKET}`, 'public-read', '--bucket', '--endpoint', ENDPOINT]);
  }
  const websiteXml = '<WebsiteConfiguration><IndexDocument><Suffix>index.html</Suffix></IndexDocument><ErrorDocument><Key>index.html</Key></ErrorDocument></WebsiteConfiguration>';
  const xmlFile = path.join(os.tmpdir(), 'quizmate-cn-website-config.xml');
  fs.writeFileSync(xmlFile, websiteXml, 'utf8');
  cli(['oss', 'website', '--method', 'put', `oss://${BUCKET}`, xmlFile, '--endpoint', ENDPOINT]);

  // The domain is already delegated to Aliyun DNS. Obtain/refresh the OSS CNAME binding.
  try { cli(['oss', 'bucket-cname', '--method', 'put', `oss://${BUCKET}`, DOMAIN, '--endpoint', ENDPOINT]); } catch (error) {
    const tokenXml = cli(['oss', 'bucket-cname', '--method', 'put', '--item', 'token', `oss://${BUCKET}`, DOMAIN, '--endpoint', ENDPOINT]);
    const token = (tokenXml.match(/<Token>([^<]+)/) || [])[1];
    if (!token) throw new Error('Unable to obtain OSS CNAME token');
    const old = JSON.parse(cli(['alidns', 'DescribeDomainRecords', '--DomainName', DOMAIN, '--RRKeyWord', '_dnsauth', '--Type', 'TXT']));
    for (const record of (old.DomainRecords?.Record || [])) cli(['alidns', 'DeleteDomainRecord', '--RecordId', record.RecordId]);
    const cnameRecords = JSON.parse(cli(['alidns', 'DescribeDomainRecords', '--DomainName', DOMAIN, '--RRKeyWord', '@', '--Type', 'CNAME']));
    for (const record of (cnameRecords.DomainRecords?.Record || [])) cli(['alidns', 'DeleteDomainRecord', '--RecordId', record.RecordId]);
    cli(['alidns', 'AddDomainRecord', '--DomainName', DOMAIN, '--RR', '_dnsauth', '--Type', 'TXT', '--Value', token]);
    cli(['alidns', 'AddDomainRecord', '--DomainName', DOMAIN, '--RR', '@', '--Type', 'CNAME', '--Value', `${BUCKET}.${ENDPOINT}`]);
    await new Promise((resolve) => setTimeout(resolve, 15000));
    cli(['oss', 'bucket-cname', '--method', 'put', `oss://${BUCKET}`, DOMAIN, '--endpoint', ENDPOINT]);
  }
  // Certificate renewal is managed by the scheduled ACME workflow. Static
  // website deployments must not overwrite the active OSS certificate.
  if (CERT_ID) {
    const certXml = `<BucketCnameConfiguration><Cname><Domain>${DOMAIN}</Domain><CertificateConfiguration><CertId>${CERT_ID}</CertId><Force>true</Force></CertificateConfiguration></Cname></BucketCnameConfiguration>`;
    const certFile = path.join(os.tmpdir(), 'quizmate-cn-cert-config.xml');
    fs.writeFileSync(certFile, certXml, 'utf8');
    cli(['oss', 'bucket-cname', '--method', 'put', '--item', 'certificate', `oss://${BUCKET}`, certFile, '--endpoint', ENDPOINT]);
    console.log(`CERT_BOUND domain=${DOMAIN} cert=${CERT_ID}`);
  } else {
    console.log(`CERT_BINDING_PRESERVED domain=${DOMAIN}`);
  }

  let ok = 0;
  for (const [rel, file] of collectFiles()) {
    await client.put(rel, file, { headers: { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' } });
    ok++;
  }
  console.log(`DEPLOY_OK bucket=${BUCKET} domain=${DOMAIN} files=${ok}`);
  for (const rel of ['index.html', 'app.js', 'download.html', 'robots.txt']) { const head = await client.head(rel); console.log(`VERIFY ${rel} ${head.res.status} ${head.res.headers['content-length'] || '?'}`); }
}

main().catch((error) => { console.error('DEPLOY_FAIL', error.message); process.exitCode = 1; });
