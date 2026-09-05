const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const OSS = require(require.resolve('ali-oss', { paths: [path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules')] }));
const tag = 'mac-delivery-20260906-permission-1';
const version = '2026.09.06.1';
const prefix = `temp/${tag}`;
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = cfg.profiles.find((item) => item.name === cfg.current) || cfg.profiles[0];
const oss = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined });
const put = (name, type) => oss.signatureUrl(`${prefix}/${name}`, { expires: 86400, method: 'PUT', 'Content-Type': type });
const payload = {
  intel: put(`QuizMate-Mac-Intel-${version}.dmg`, 'application/x-apple-diskimage'),
  intelZip: put(`QuizMate-Mac-x64-${version}.zip`, 'application/zip'),
  intelLog: put('mac-x64-build.log', 'text/plain; charset=utf-8'),
  apple: put(`QuizMate-Mac-Apple-Silicon-${version}.dmg`, 'application/x-apple-diskimage'),
  appleZip: put(`QuizMate-Mac-arm64-${version}.zip`, 'application/zip'),
  appleLog: put('mac-arm64-build.log', 'text/plain; charset=utf-8'),
};
const message = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
const runGh = (args, input) => execFileSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
try { runGh(['api', '--method', 'DELETE', `repos/xiaoer4585/quizmate/git/refs/tags/${tag}`]); } catch {}
const object = process.env.DELIVERY_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tagObject = JSON.parse(runGh(['api', '--method', 'POST', 'repos/xiaoer4585/quizmate/git/tags', '--input', '-'], JSON.stringify({ tag, message, object, type: 'commit' })));
runGh(['api', '--method', 'POST', 'repos/xiaoer4585/quizmate/git/refs', '-f', `ref=refs/tags/${tag}`, '-f', `sha=${tagObject.sha}`]);
console.log(`DELIVERY_TAG_PUSHED ${tag}`);
