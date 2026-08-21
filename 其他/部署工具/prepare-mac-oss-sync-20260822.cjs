const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
const objects = [
  ['downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.dmg', 'mac客户端/发布包/2026.8.22/QuizMate-Mac-Apple-Silicon-2026.8.22.dmg', 'application/x-apple-diskimage'],
  ['downloads/QuizMate-Mac-Intel-2026.8.22.dmg', 'mac客户端/发布包/2026.8.22/QuizMate-Mac-Intel-2026.8.22.dmg', 'application/x-apple-diskimage'],
  ['mac/QuizMate-Mac-arm64-2026.8.22.zip', 'mac客户端/发布包/2026.8.22/QuizMate-Mac-arm64-2026.8.22.zip', 'application/zip'],
  ['mac/QuizMate-Mac-x64-2026.8.22.zip', 'mac客户端/发布包/2026.8.22/QuizMate-Mac-x64-2026.8.22.zip', 'application/zip'],
  ['mac/latest-mac.yml', '官网模块/正式官网-quizmate.vip/mac/latest-mac.yml', 'text/yaml; charset=utf-8'],
  ['download.html', '官网模块/正式官网-quizmate.vip/download.html', 'text/html; charset=utf-8'],
  ['index.html', '官网模块/正式官网-quizmate.vip/index.html', 'text/html; charset=utf-8'],
];

function client(bucket) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket,
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token || undefined,
  });
}

function main() {
  const uploads = [];
  for (const bucket of ['quizmate-cn', 'quizmate-vip']) {
    const storage = client(bucket);
    for (const [object, file, contentType] of objects) {
      uploads.push({
        bucket,
        object,
        file,
        contentType,
        url: storage.signatureUrl(object, { expires: 3600, method: 'PUT', 'Content-Type': contentType }),
        backupGetUrl: storage.signatureUrl(object, { expires: 3600, method: 'GET' }),
        backupPutUrl: storage.signatureUrl(`rollback/CHG-20260820-09/${object}`, { expires: 3600, method: 'PUT', 'Content-Type': contentType }),
      });
    }
  }
  process.stdout.write(JSON.stringify(uploads));
}

main();
