const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const VERSION = '2026.8.24';
const CHANGE = 'CHG-20260822-01';
const site = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const release = path.join(ROOT, 'mac客户端/发布包/QuizMate-Mac-2026.8.24');
const objects = [
  [`downloads/QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`, `QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`, 'application/x-apple-diskimage'],
  [`downloads/QuizMate-Mac-Intel-${VERSION}.dmg`, `QuizMate-Mac-Intel-${VERSION}.dmg`, 'application/x-apple-diskimage'],
  [`mac/QuizMate-Mac-arm64-${VERSION}.zip`, `QuizMate-Mac-Apple-Silicon-${VERSION}.zip`, 'application/zip'],
  [`mac/QuizMate-Mac-x64-${VERSION}.zip`, `QuizMate-Mac-Intel-${VERSION}.zip`, 'application/zip'],
  ['mac/latest-mac.yml', null, 'text/yaml; charset=utf-8'],
  ['download.html', null, 'text/html; charset=utf-8'],
  ['index.html', null, 'text/html; charset=utf-8'],
];
const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((p) => p.name === config.current) || config.profiles[0];
function client(bucket) { return new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket, secure: true, accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined, timeout: 1200000 }); }
function localFile(object, name) { if (name) return path.join(release, name); return object === 'mac/latest-mac.yml' ? path.join(site, 'mac/latest-mac.yml') : path.join(site, object); }
async function main() {
  for (const bucket of ['quizmate-cn', 'quizmate-vip']) {
    const storage = client(bucket);
    for (const [object, name, contentType] of objects) {
      const file = localFile(object, name);
      const backup = `rollback/${CHANGE}/${object}`;
      try { await storage.head(object); await storage.copy(backup, object); } catch (e) { if (Number(e.status) !== 404 && String(e.code).toLowerCase() !== 'nosuchkey') throw e; }
      const url = storage.signatureUrl(object, { expires: 3600, method: 'PUT', 'Content-Type': contentType });
      execFileSync('curl.exe', ['--fail', '--silent', '--show-error', '--retry', '8', '--retry-all-errors', '--connect-timeout', '30', '--max-time', '1800', '-X', 'PUT', '-H', `Content-Type: ${contentType}`, '-H', 'Cache-Control: no-cache', '--upload-file', file, url], { stdio: 'inherit', timeout: 1900000 });
      const remote = await storage.get(object);
      const local = fs.readFileSync(file);
      if (!remote.content.equals(local)) throw new Error(`content mismatch: ${bucket}/${object}`);
      console.log(`OK ${bucket}/${object} ${local.length}`);
    }
  }
}
main().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
