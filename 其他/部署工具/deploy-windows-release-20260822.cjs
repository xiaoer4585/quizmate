// CHG-20260822 官网乱码修复 + Windows 客户端 2026.8.22 发布上线
// 部署范围：quizmate-vip（suite 自动更新文件 + downloads）、quizmate-cn（downloads；官网页面已由 deploy-website.cjs 全量重新部署）
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../../');
const release = path.join(ROOT, 'windows客户端/QuizMate-Windows/release');
const site = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const version = '2026.8.22';
const files = [
  ['suite/latest.yml', path.join(release, 'latest.yml'), 'text/yaml; charset=utf-8'],
  [`suite/QuizMate-Windows-${version}.exe`, path.join(release, `QuizMate-Windows-${version}.exe`), 'application/vnd.microsoft.portable-executable'],
  [`suite/QuizMate-Windows-${version}.exe.blockmap`, path.join(release, `QuizMate-Windows-${version}.exe.blockmap`), 'application/octet-stream'],
  [`downloads/QuizMate-Windows-${version}.exe`, path.join(release, `QuizMate-Windows-${version}.exe`), 'application/vnd.microsoft.portable-executable'],
];

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const item = config.profiles.find((p) => p.name === config.current) || config.profiles[0];
  if (!item?.access_key_id || !item?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return item;
}

function client(bucket, endpoint, p) {
  return new OSS({
    endpoint, cname: endpoint.includes('www.quizmate.vip'), bucket, secure: true,
    accessKeyId: p.access_key_id, accessKeySecret: p.access_key_secret, stsToken: p.sts_token || undefined,
    timeout: 1_200_000,
  });
}

async function backup(cl, object) {
  const rollback = `rollback/CHG-20260822-website-fix/${object}`;
  try {
    await cl.head(object);
    await cl.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`BACKUP_OK ${object} -> ${rollback}`);
  } catch (error) {
    if (String(error.code || '').toLowerCase() === 'nosuchkey' || Number(error.status) === 404) {
      console.log(`BACKUP_SKIP ${object}`);
      return;
    }
    throw error;
  }
}

async function put(cl, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing local file: ${file}`);
  const result = await cl.multipartUpload(object, file, {
    parallel: 16,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  const head = await cl.head(object);
  console.log(`UPLOAD_OK ${object} size=${head.res.headers['content-length'] || '?'}`);
}

async function main() {
  // 发布前校验：本地产物版本正确且官网页面已指向新版本
  const latestYml = fs.readFileSync(path.join(release, 'latest.yml'), 'utf8');
  if (!latestYml.includes(`version: ${version}`)) throw new Error(`local latest.yml is not ${version}`);
  if (!fs.existsSync(path.join(release, `QuizMate-Windows-${version}.exe`))) throw new Error('local installer missing');
  for (const rel of ['download.html', 'index.html', 'blog/article-exam-skills.html']) {
    const html = fs.readFileSync(path.join(site, rel), 'utf8');
    if (html.includes('QuizMate-Windows-2026.8.21.exe')) throw new Error(`${rel} still links 2026.8.21`);
    if (!html.includes(`QuizMate-Windows-${version}.exe`)) throw new Error(`${rel} lacks ${version} download link`);
  }

  const p = profile();
  const vip = client('quizmate-vip', 'https://www.quizmate.vip', p);
  const cn = client('quizmate-cn', 'https://oss-cn-beijing.aliyuncs.com', p);

  for (const [object, file, type] of files) {
    await backup(vip, object);
    await put(vip, object, file, type);
  }
  for (const [object, file, type] of files.filter(([object]) => object.startsWith('downloads/'))) {
    await backup(cn, object);
    await put(cn, object, file, type);
  }

  const yml = (await vip.get('suite/latest.yml')).content.toString('utf8');
  if (!yml.includes(`version: ${version}`) || !yml.includes(`QuizMate-Windows-${version}.exe`)) {
    throw new Error('latest.yml verification failed');
  }
  console.log(`DEPLOY_WINDOWS_RELEASE_OK version=${version}`);
}

main().catch((error) => {
  console.error(`DEPLOY_WINDOWS_RELEASE_FAILED ${error.name || ''} ${error.code || ''} ${error.message}`);
  process.exitCode = 1;
});
