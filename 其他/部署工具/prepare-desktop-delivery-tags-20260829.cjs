const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const moduleRoots = [
  path.resolve(__dirname, '../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const VERSION = '2026.08.29';
const CHANGE_ID = 'CHG-20260829-01';
const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
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

const contentTypes = {
  exe: 'application/vnd.microsoft.portable-executable',
  blockmap: 'application/octet-stream',
  sha256: 'text/plain; charset=utf-8',
  dmg: 'application/x-apple-diskimage',
  zip: 'application/zip',
  log: 'text/plain; charset=utf-8',
};

function signedPut(object, contentType) {
  return storage.signatureUrl(object, { expires: 172800, method: 'PUT', 'Content-Type': contentType });
}

function pushAnnotatedTag(tag, payload) {
  const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  execFileSync('git', ['tag', '-a', tag, '-m', message], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('git', [
    'push', 'git@github.com:xiaoer4585/quizmate.git', `refs/tags/${tag}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`DELIVERY_TAG_PUSHED ${tag}`);
}

async function main() {
  const windowsExe = `suite/QuizMate-Windows-${VERSION}.exe`;
  const windowsBlockmap = `${windowsExe}.blockmap`;
  const macIntelDmg = `downloads/QuizMate-Mac-Intel-${VERSION}.dmg`;
  const macArmDmg = `downloads/QuizMate-Mac-Apple-Silicon-${VERSION}.dmg`;
  const macIntelZip = `mac/QuizMate-Mac-x64-${VERSION}.zip`;
  const macArmZip = `mac/QuizMate-Mac-arm64-${VERSION}.zip`;
  const token = Date.now();
  const windowsTag = `windows-publish-20260829-prod-${token}`;
  const macTag = `mac-publish-20260829-prod-${token}`;
  pushAnnotatedTag(windowsTag, {
    exe: signedPut(windowsExe, contentTypes.exe),
    blockmap: signedPut(windowsBlockmap, contentTypes.blockmap),
    sha256: signedPut(`temp/${CHANGE_ID}/windows-sha256.txt`, contentTypes.sha256),
  });
  pushAnnotatedTag(macTag, {
    intel: signedPut(macIntelDmg, contentTypes.dmg),
    intelZip: signedPut(macIntelZip, contentTypes.zip),
    intelLog: signedPut(`temp/${CHANGE_ID}/mac-x64-build.log`, contentTypes.log),
    apple: signedPut(macArmDmg, contentTypes.dmg),
    appleZip: signedPut(macArmZip, contentTypes.zip),
    appleLog: signedPut(`temp/${CHANGE_ID}/mac-arm64-build.log`, contentTypes.log),
  });
  console.log(`DELIVERY_TARGET bucket=quizmate-cn version=${VERSION}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
