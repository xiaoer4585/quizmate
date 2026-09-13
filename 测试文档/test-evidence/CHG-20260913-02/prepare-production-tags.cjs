const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OSS = require(require.resolve('ali-oss', { paths: [path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules')] }));

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = cfg.profiles.find((item) => item.name === cfg.current) || cfg.profiles[0];
const storage = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined });
const put = (object, type) => storage.signatureUrl(object, { expires: 172800, method: 'PUT', 'Content-Type': type });
const token = Date.now();
const windowsTag = `windows-publish-20260913-${token}`;
const macTag = `mac-publish-20260913-${token}`;
const base = { exe: put('suite/QuizMate-Windows-2026.09.10.exe', 'application/vnd.microsoft.portable-executable'), blockmap: put('suite/QuizMate-Windows-2026.09.10.exe.blockmap', 'application/octet-stream'), sha256: put('temp/CHG-20260913-02/windows-sha256.txt', 'text/plain; charset=utf-8') };
const mac = { intel: put('downloads/QuizMate-Mac-Intel-2026.09.12.dmg', 'application/x-apple-diskimage'), intelZip: put('mac/QuizMate-Mac-x64-2026.09.12.zip', 'application/zip'), intelLog: put('temp/CHG-20260913-02/mac-x64-build.log', 'text/plain; charset=utf-8'), apple: put('downloads/QuizMate-Mac-Apple-Silicon-2026.09.12.dmg', 'application/x-apple-diskimage'), appleZip: put('mac/QuizMate-Mac-arm64-2026.09.12.zip', 'application/zip'), appleLog: put('temp/CHG-20260913-02/mac-arm64-build.log', 'text/plain; charset=utf-8') };
function push(tag, payload) {
  const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  execFileSync('git', ['tag', '-a', tag, '-m', message], { stdio: 'inherit' });
  execFileSync('git', ['push', 'github', `refs/tags/${tag}`], { stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
  console.log(`TAG_PUSHED ${tag}`);
}
push(windowsTag, base);
push(macTag, mac);
console.log(`WINDOWS_TAG=${windowsTag}`);
console.log(`MAC_TAG=${macTag}`);
