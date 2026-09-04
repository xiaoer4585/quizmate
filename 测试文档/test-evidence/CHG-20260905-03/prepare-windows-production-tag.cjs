const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const moduleRoots = [
  path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const VERSION = '2026.09.05.1';
const CHANGE_ID = 'CHG-20260905-03';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const config = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
);
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
if (!profile?.access_key_id || !profile?.access_key_secret) {
  throw new Error('Aliyun profile is incomplete');
}

const storage = new OSS({
  region: 'cn-beijing',
  endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  bucket: 'quizmate-cn',
  secure: true,
  accessKeyId: profile.access_key_id,
  accessKeySecret: profile.access_key_secret,
  stsToken: profile.sts_token || undefined,
});

const signedPut = (object, contentType) => storage.signatureUrl(object, {
  expires: 7200,
  method: 'PUT',
  'Content-Type': contentType,
});

async function main() {
  const tag = `windows-publish-20260905-1-prod-${Date.now()}`;
  const payload = {
    exe: signedPut(
      `suite/QuizMate-Windows-${VERSION}.exe`,
      'application/vnd.microsoft.portable-executable',
    ),
    blockmap: signedPut(
      `suite/QuizMate-Windows-${VERSION}.exe.blockmap`,
      'application/octet-stream',
    ),
    sha256: signedPut(
      `temp/${CHANGE_ID}/windows-sha256.txt`,
      'text/plain; charset=utf-8',
    ),
  };
  const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  execFileSync('git', ['tag', '-a', tag, '-m', message, commit], { stdio: 'inherit' });
  execFileSync('git', ['push', 'github', `refs/tags/${tag}`], { stdio: 'inherit' });
  process.stdout.write(`PRODUCTION_TAG_PUSHED ${tag} commit=${commit}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
