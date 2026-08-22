const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');
const version = process.env.MAC_RELEASE_VERSION || '2026.8.22';
const gitRemote = process.env.GIT_REMOTE || 'newgithub';
const versionToken = version.replaceAll('.', '');
const tag = `mac-build-${versionToken}-${Date.now()}`;
const prefix = 'downloads';
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
const client = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined });
// Large arm64 packages can take longer than an hour to reach OSS from a hosted runner.
const url = (object, type) => client.signatureUrl(object, { expires: 86400, method: 'PUT', 'Content-Type': type });
const payload = {
  intel: url(`${prefix}/QuizMate-Mac-Intel-${version}.dmg`, 'application/x-apple-diskimage'),
  intelZip: url(`mac/QuizMate-Mac-x64-${version}.zip`, 'application/zip'),
  intelLog: url(`mac/QuizMate-Mac-x64-${version}-build.log`, 'text/plain; charset=utf-8'),
  apple: url(`${prefix}/QuizMate-Mac-Apple-Silicon-${version}.dmg`, 'application/x-apple-diskimage'),
  appleZip: url(`mac/QuizMate-Mac-arm64-${version}.zip`, 'application/zip'),
  appleLog: url(`mac/QuizMate-Mac-arm64-${version}-build.log`, 'text/plain; charset=utf-8'),
};
const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
execFileSync('git', ['tag', '-a', tag, '-m', message], { stdio: 'inherit' });
execFileSync('git', ['push', gitRemote, `refs/tags/${tag}`], { stdio: 'inherit' });
console.log(`MAC_RELEASE_TAG_PUSHED ${tag}`);
