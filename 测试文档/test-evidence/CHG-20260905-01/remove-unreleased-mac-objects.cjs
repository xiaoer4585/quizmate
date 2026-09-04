const fs = require('fs');
const path = require('path');
const OSS = require('../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun profile unavailable');

const storage = new OSS({
  region: 'cn-beijing',
  endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  bucket: 'quizmate-cn',
  secure: true,
  accessKeyId: profile.access_key_id,
  accessKeySecret: profile.access_key_secret,
  stsToken: profile.sts_token || undefined,
});

const targets = [
  'downloads/QuizMate-Mac-Intel-2026.09.05.dmg',
  'downloads/QuizMate-Mac-Apple-Silicon-2026.09.05.dmg',
  'mac/QuizMate-Mac-x64-2026.09.05.zip',
  'mac/QuizMate-Mac-arm64-2026.09.05.zip',
];

async function main() {
  const manifest = (await storage.get('mac/latest-mac.yml')).content.toString('utf8');
  const download = (await storage.get('download.html')).content.toString('utf8');
  if (manifest.includes('2026.09.05') || download.includes('QuizMate-Mac-Apple-Silicon-2026.09.05.dmg') || download.includes('QuizMate-Mac-Intel-2026.09.05.dmg')) {
    throw new Error('Mac 2026.09.05 is referenced by a production mapping; refusing object cleanup');
  }
  for (const object of targets) {
    try {
      await storage.head(object);
      await storage.delete(object);
      process.stdout.write(`REMOVED_UNRELEASED_MAC_OBJECT ${object}\n`);
    } catch (error) {
      if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') {
        process.stdout.write(`UNRELEASED_MAC_OBJECT_ABSENT ${object}\n`);
        continue;
      }
      throw error;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
