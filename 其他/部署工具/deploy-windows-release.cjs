// QuizMate Windows 客户端通用发布脚本（防"历史版本当最新版发布"）
//
// 用法：
//   node 其他/部署工具/deploy-windows-release.cjs --version 2026.8.23
//
// 可选环境变量：
//   QUIZMATE_RELEASE_DIR     覆盖发布目录（默认 releases/<YYYY-MM-DD>/，YYYY-MM-DD 来自 --version 的日期部分）
//   QUIZMATE_UPDATE_BASE_URL 覆盖更新源域名（默认 https://www.quizmate.cn，部署脚本会自动校验 app-update.yml 的 url 与此一致）
//   QUIZMATE_PUBLIC_BASE_URL 覆盖官网下载域名（默认 https://www.quizmate.cn，download.html/index.html 的链接会校验与之同源）
//   QUIZMATE_SKIP_OSS=1       只做本地校验，不推送 OSS（CI 预演或本地自检）
//
// 行为：
//   1) 预校验：package.json / resources/config.json / latest.yml / exe 文件名 / app-update.yml url 必须一致
//   2) 推送：suite + downloads + 官网 HTML 到 quizmate-cn（绑定 www.quizmate.cn）
//   3) 后校验：远端 GET suite/latest.yml + HEAD exe 二次确认
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../../');
const PROJECT = path.join(ROOT, 'windows客户端/QuizMate-Windows');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');

const args = parseArgs(process.argv.slice(2));
if (!args.version) throw new Error('--version is required, e.g. --version 2026.8.23');
const version = args.version;
if (!/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(version)) throw new Error(`Bad version format: ${version}`);

const versionDate = `20${version.slice(2, 4)}-${version.slice(5, 6).padStart(2, '0')}-${version.slice(7, 9).padStart(2, '0')}`;
const releaseDir = process.env.QUIZMATE_RELEASE_DIR || path.join(PROJECT, 'releases', versionDate);
const updateBase = stripSlash(process.env.QUIZMATE_UPDATE_BASE_URL || 'https://www.quizmate.cn');
const publicBase = stripSlash(process.env.QUIZMATE_PUBLIC_BASE_URL || 'https://www.quizmate.cn');
const skipOss = process.env.QUIZMATE_SKIP_OSS === '1';
const dryRun = skipOss;

const exeName = `QuizMate-Windows-${version}.exe`;
const blockmapName = `${exeName}.blockmap`;
const latestYml = path.join(releaseDir, 'latest.yml');
const exePath = path.join(releaseDir, exeName);
const blockmapPath = path.join(releaseDir, blockmapName);
const packageJsonPath = path.join(PROJECT, 'package.json');
const configJsonPath = path.join(PROJECT, 'resources', 'config.json');
const appUpdateYmlPath = path.join(releaseDir, 'win-unpacked', 'resources', 'app-update.yml');
const versionFile = path.join(PROJECT, 'releases', 'VERSION');

const SITE_FILES = [
  ['download.html', path.join(SITE, 'download.html')],
  ['index.html', path.join(SITE, 'index.html')],
  ['blog/article-exam-skills.html', path.join(SITE, 'blog', 'article-exam-skills.html')],
];
const OBJECT_KEYS = [
  ['suite/latest.yml', latestYml, 'text/yaml; charset=utf-8'],
  [`suite/${exeName}`, exePath, 'application/vnd.microsoft.portable-executable'],
  [`suite/${blockmapName}`, blockmapPath, 'application/octet-stream'],
  [`downloads/${exeName}`, exePath, 'application/vnd.microsoft.portable-executable'],
  [`downloads/${blockmapName}`, blockmapPath, 'application/octet-stream'],
  ['downloads/latest.yml', latestYml, 'text/yaml; charset=utf-8'],
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function stripSlash(u) { return u.endsWith('/') ? u.slice(0, -1) : u; }

function sha512Base64(buf) { return crypto.createHash('sha512').update(buf).digest('base64'); }

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function readText(p) { return fs.readFileSync(p, 'utf8'); }

function assertFile(p, label) { if (!fs.existsSync(p)) throw new Error(`[precheck] missing ${label}: ${p}`); }

function precheck() {
  // VERSION 文件一致性
  assertFile(versionFile, 'VERSION file');
  const fileVersion = readText(versionFile).trim();
  if (fileVersion !== version) {
    throw new Error(`[precheck] VERSION file=${fileVersion} but --version=${version}`);
  }
  console.log(`[precheck] VERSION file matches: ${fileVersion}`);

  // 必备产物
  assertFile(latestYml, 'latest.yml');
  assertFile(exePath, 'installer exe');
  assertFile(blockmapPath, 'installer blockmap');

  // 本地 latest.yml 的 version
  const ymlText = readText(latestYml);
  if (!ymlText.includes(`version: ${version}`)) {
    throw new Error(`[precheck] latest.yml does not declare version: ${version}`);
  }

  // package.json / config.json 的 version
  const pkg = readJson(packageJsonPath);
  if (pkg.version !== version) {
    throw new Error(`[precheck] package.json version=${pkg.version} but expected ${version}`);
  }
  console.log(`[precheck] package.json version matches: ${pkg.version}`);

  const cfg = readJson(configJsonPath);
  if (cfg.version !== version) {
    throw new Error(`[precheck] resources/config.json version=${cfg.version} but expected ${version}`);
  }
  console.log(`[precheck] resources/config.json version matches: ${cfg.version}`);

  // sha512 校验：latest.yml 的 sha512 必须等于本地 exe 的真实 sha512
  const exeSha = sha512Base64(fs.readFileSync(exePath));
  const ymlShaMatch = ymlText.match(/^sha512:\s*(\S+)/m);
  if (!ymlShaMatch) throw new Error('[precheck] latest.yml has no sha512');
  if (ymlShaMatch[1] !== exeSha) {
    throw new Error(`[precheck] sha512 mismatch: latest.yml=${ymlShaMatch[1]} but exe=${exeSha}`);
  }
  console.log(`[precheck] latest.yml sha512 matches local exe (${exeSha.slice(0, 12)}…)`);

  // app-update.yml 的 url 域名必须与 updateBase 同源（防 publish.url 与部署域名割裂）
  assertFile(appUpdateYmlPath, 'app-update.yml');
  const appUpdateText = readText(appUpdateYmlPath);
  const urlMatch = appUpdateText.match(/^url:\s*(\S+)/m);
  if (!urlMatch) throw new Error('[precheck] app-update.yml has no url');
  const expectedUrlPrefix = `${updateBase}/suite/`;
  if (!urlMatch[1].startsWith(expectedUrlPrefix)) {
    throw new Error(`[precheck] app-update.yml url=${urlMatch[1]} does not start with ${expectedUrlPrefix}`);
  }
  console.log(`[precheck] app-update.yml url aligned with update base: ${urlMatch[1]}`);

  // 官网 HTML 校验：必须含新版本、不含任何旧版本（Windows 客户端相关字符串）
  // 仅校验 Windows 相关标记，避免误伤 Mac / Android 端各自的版本号。
  const legacyPatterns = [
    /QuizMate-Windows-2026\.8\.22\.exe/,
    /QuizMate-Windows-2026\.8\.21\.exe/,
    /QuizMate-Windows-2026\.8\.20\.exe/,
  ];
  const legacyTags = ['2026.8.22-windows', 'windows-2026.8.22', 'windows-2026.8.21', 'windows-2026.8.20'];
  for (const [object, file] of SITE_FILES) {
    const html = readText(file);
    if (!html.includes(exeName)) {
      throw new Error(`[precheck] ${object} does not link ${exeName}`);
    }
    for (const re of legacyPatterns) {
      if (re.test(html)) throw new Error(`[precheck] ${object} still links a legacy installer (${re})`);
    }
    for (const tag of legacyTags) {
      if (tag === version) continue;
      if (html.includes(tag)) throw new Error(`[precheck] ${object} still mentions ${tag}`);
    }
  }
  console.log('[precheck] all site pages link the new Windows version and no legacy Windows installer remains');

  // 域名一致性：官网 HTML 的下载链接必须使用 publicBase
  const linkRegex = new RegExp(`https?://[^"'\\\`\\s]+/${exeName}`, 'g');
  for (const [object, file] of SITE_FILES) {
    const html = readText(file);
    const links = html.match(linkRegex) || [];
    for (const link of links) {
      if (!link.startsWith(`${publicBase}/`)) {
        throw new Error(`[precheck] ${object} has off-domain link: ${link}`);
      }
    }
  }
  console.log(`[precheck] all download links in site pages resolve to ${publicBase}`);
}

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const item = config.profiles.find((p) => p.name === config.current) || config.profiles[0];
  if (!item?.access_key_id || !item?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return item;
}

function client(bucket, p) {
  return new OSS({
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket, secure: true,
    accessKeyId: p.access_key_id,
    accessKeySecret: p.access_key_secret,
    stsToken: p.sts_token || undefined,
    timeout: 1_200_000,
  });
}

async function backup(c, object, tag) {
  const rollback = `rollback/${tag}/${object}`;
  try {
    await c.head(object);
    await c.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`BACKUP_OK ${object} -> ${rollback}`);
  } catch (error) {
    if (String(error.code || '').toLowerCase() === 'nosuchkey' || Number(error.status) === 404) {
      console.log(`BACKUP_SKIP ${object}`);
      return;
    }
    throw error;
  }
}

async function put(c, object, file, contentType, tag) {
  if (!fs.existsSync(file)) throw new Error(`Missing local file: ${file}`);
  const result = await c.multipartUpload(object, file, {
    parallel: 16,
    partSize: 1024 * 1024,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  if (result.res.status !== 200) throw new Error(`Upload failed: ${object}`);
  const head = await c.head(object);
  console.log(`UPLOAD_OK ${object} size=${head.res.headers['content-length'] || '?'} rollback=${tag}`);
}

async function postverify(c) {
  // 1) suite/latest.yml 必须含目标 version
  const suiteBuf = await c.get('suite/latest.yml');
  const suiteText = suiteBuf.content.toString('utf8');
  if (!suiteText.includes(`version: ${version}`)) {
    throw new Error('[postverify] remote suite/latest.yml does not declare ' + version);
  }
  if (!suiteText.includes(exeName)) {
    throw new Error('[postverify] remote suite/latest.yml does not reference ' + exeName);
  }
  // 2) 远端 suite exe HEAD 必须存在且 Content-Length 与本地一致
  const remoteHead = await c.head(`suite/${exeName}`);
  const remoteLen = Number(remoteHead.res.headers['content-length']);
  const localLen = fs.statSync(exePath).size;
  if (remoteLen !== localLen) {
    throw new Error(`[postverify] remote suite exe size=${remoteLen} but local=${localLen}`);
  }
  console.log(`[postverify] suite/latest.yml + suite/${exeName} verified (size=${remoteLen})`);
}

async function main() {
  precheck();
  if (dryRun) {
    console.log(`[dry-run] QUIZMATE_SKIP_OSS=1, skip OSS push. releaseDir=${releaseDir}`);
    console.log(`DEPLOY_WINDOWS_RELEASE_DRYRUN_OK version=${version}`);
    return;
  }
  const p = profile();
  const cn = client('quizmate-cn', p);
  const tag = `CHG-${version.replace(/\./g, '')}-WIN`;
  for (const [object, file, type] of OBJECT_KEYS) {
    await backup(cn, object, tag);
    await put(cn, object, file, type, tag);
  }
  for (const [object, file] of SITE_FILES) {
    await backup(cn, object, tag);
    await put(cn, object, file, 'text/html; charset=utf-8', tag);
  }
  await postverify(cn);
  console.log(`DEPLOY_WINDOWS_RELEASE_OK version=${version} bucket=quizmate-cn tag=${tag}`);
}

main().catch((error) => {
  console.error(`DEPLOY_WINDOWS_RELEASE_FAILED ${error.name || ''} ${error.code || ''} ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});
