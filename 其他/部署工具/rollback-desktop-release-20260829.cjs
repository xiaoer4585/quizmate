const fs = require('fs');
const path = require('path');
const moduleRoots = [
  path.resolve(__dirname, '../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
const storage = new OSS({
  region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true,
  accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined,
});
const objects = [
  'suite/latest.yml', 'downloads/latest.yml', 'mac/latest-mac.yml',
  'download.html', 'index.html', 'blog/article-exam-skills.html',
];

async function main() {
  for (const object of objects) {
    const source = `rollback/CHG-20260829-01/${object}`;
    await storage.head(source);
    await storage.copy(object, source, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    console.log(`ROLLBACK_OK ${object}`);
  }
  console.log('ROLLBACK_DESKTOP_RELEASE_OK bucket=quizmate-cn');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

