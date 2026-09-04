const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const moduleRoots = [
  path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const VERSION = '2026.09.05';
const CHANGE_ID = 'CHG-20260905-01';
const profileFile = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
const config = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile is incomplete');

const storage = new OSS({
  region: 'cn-beijing',
  endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  bucket: 'quizmate-cn',
  secure: true,
  accessKeyId: profile.access_key_id,
  accessKeySecret: profile.access_key_secret,
  stsToken: profile.sts_token || undefined,
});

const types = {
  exe: 'application/vnd.microsoft.portable-executable',
  blockmap: 'application/octet-stream',
  sha256: 'text/plain; charset=utf-8',
  dmg: 'application/x-apple-diskimage',
  zip: 'application/zip',
  log: 'text/plain; charset=utf-8',
};

const signedPut = (object, contentType) => storage.signatureUrl(object, {
  expires: 7200,
  method: 'PUT',
  'Content-Type': contentType,
});

function pushAnnotatedTag(tag, payload) {
  const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  execFileSync('git', ['tag', '-a', tag, '-m', message, '1558599dca104dd948c517d060a6962194faed47'], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('git', ['push', 'git@github.com:xiaoer4585/quizmate.git', `refs/tags/${tag}`], { stdio: ['ignore', 'ignore', 'inherit'] });
  process.stdout.write(`PRODUCTION_TAG_PUSHED ${tag}\n`);
}

const token = Date.now();
const windowsTag = `windows-publish-20260905-prod-${token}`;
const macTag = `mac-publish-20260905-prod-${token}`;

pushAnnotatedTag(windowsTag, {
  exe: signedPut(`suite/QuizMate-Windows-${VERSION}.exe`, types.exe),
  blockmap: signedPut(`suite/QuizMate-Windows-${VERSION}.exe.blockmap`, types.blockmap),
  sha256: signedPut(`temp/${CHANGE_ID}/windows-sha256.txt`, types.sha256),
});

pushAnnotatedTag(macTag, {
  intel: signedPut(`downloads/QuizMate-Mac-Intel-${VERSION}.dmg`, types.dmg),
  intelZip: signedPut(`mac/QuizMate-Mac-x64-${VERSION}.zip`, types.zip),
  intelLog: signedPut(`temp/${CHANGE_ID}/mac-x64-build.log`, types.log),
  apple: signedPut(`downloads/QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`, types.dmg),
  appleZip: signedPut(`mac/QuizMate-Mac-arm64-${VERSION}.zip`, types.zip),
  appleLog: signedPut(`temp/${CHANGE_ID}/mac-arm64-build.log`, types.log),
});

process.stdout.write(`PRODUCTION_TARGET bucket=quizmate-cn version=${VERSION}\n`);
