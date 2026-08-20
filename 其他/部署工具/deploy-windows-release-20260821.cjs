// CHG-20260820-06 Windows 客户端 2026.8.21 发布（面试悬浮窗快捷键调节大小，用户实测通过后上线）
// 部署范围：quizmate-vip（suite 自动更新文件 + downloads）、quizmate-cn（downloads + 官网下载页）
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../../');
const release = path.join(ROOT, 'windows客户端/QuizMate-Windows/release');
const site = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const version = '2026.8.21';
const files = [
  ['suite/latest.yml', path.join(release, 'latest.yml'), 'text/yaml; charset=utf-8'],
  [`suite/QuizMate-Windows-${version}.exe`, path.join(release, `QuizMate-Windows-${version}.exe`), 'application/vnd.microsoft.portable-executable'],
  [`suite/QuizMate-Windows-${version}.exe.blockmap`, path.join(release, `QuizMate-Windows-${version}.exe.blockmap`), 'application/octet-stream'],
  [`downloads/QuizMate-Windows-${version}.exe`, path.join(release, `QuizMate-Windows-${version}.exe`), 'application/vnd.microsoft.portable-executable'],
];
const siteFiles = [
  ['download.html', path.join(site, 'download.html')],
  ['index.html', path.join(site, 'index.html')],
  ['blog/article-exam-skills.html', path.join(site, 'blog/article-exam-skills.html')],
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

async function backup(client, object) {
  const rollback = `rollback/CHG-20260820-06/${object}`;
  try {
    await client.head(object);
    // ali-oss copy(name, sourceName)：从 sourceName 复制到 name，备份方向为 rollback <- object
    await client.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`BACKUP_OK ${object} -> ${rollback}`);
  } catch (error) {
    if (String(error.code || '').toLowerCase() === 'nosuchkey' || Number(error.status) === 404) {
      console.log(`BACKUP_SKIP ${object}`);
      return;
    }
    throw error;
  }
}

async function put(client, object, file, contentType) {
  if (!fs.existsSync(file)) throw new Error(`Missing local file: ${file}`);
  const result = await client.multipartUpload(object, file, {
    parallel: 16,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  const head = await client.head(object);
  console.log(`UPLOAD_OK ${object} size=${head.res.headers['content-length'] || '?'}`);
}

async function main() {
  // 发布前校验：本地产物版本正确且官网页面已指向新版本
  const latestYml = fs.readFileSync(path.join(release, 'latest.yml'), 'utf8');
  if (!latestYml.includes(`version: ${version}`)) throw new Error(`local latest.yml is not ${version}`);
  if (!fs.existsSync(path.join(release, `QuizMate-Windows-${version}.exe`))) throw new Error('local installer missing');
  for (const [object, file] of siteFiles) {
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes('QuizMate-Windows-2026.8.20.exe')) throw new Error(`${object} still links 2026.8.20`);
    if (!html.includes(`QuizMate-Windows-${version}.exe`)) throw new Error(`${object} lacks ${version} download link`);
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
  // 官网页面只部署到 quizmate-cn；quizmate-vip bucket 只保留跳转页、admin-web、suite 更新文件
  for (const [object, file] of siteFiles) {
    await backup(cn, object);
    await put(cn, object, file, 'text/html; charset=utf-8');
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
