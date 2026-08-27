const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const version = '2026.8.26';
const config = JSON.parse(fs.readFileSync(`${os.homedir()}/.aliyun/config.json`, 'utf8'));
const profile = config.profiles.find((item) => item.name === (config.current || 'default')) || config.profiles[0];
const client = new OSS({
  region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true,
  accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined,
});

async function sha512(object) {
  const stream = (await client.getStream(object)).stream;
  const hash = crypto.createHash('sha512');
  let size = 0;
  for await (const chunk of stream) { hash.update(chunk); size += chunk.length; }
  return { sha512: hash.digest('base64'), size };
}

async function main() {
  const arm = await sha512(`mac/QuizMate-Mac-arm64-${version}.zip`);
  const intel = await sha512(`mac/QuizMate-Mac-x64-${version}.zip`);
  const yml = [
    `version: ${version}`,
    'files:',
    `  - url: QuizMate-Mac-arm64-${version}.zip`,
    `    sha512: ${arm.sha512}`,
    `    size: ${arm.size}`,
    `  - url: QuizMate-Mac-x64-${version}.zip`,
    `    sha512: ${intel.sha512}`,
    `    size: ${intel.size}`,
    `path: QuizMate-Mac-arm64-${version}.zip`,
    `sha512: ${arm.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');
  await client.put('mac/latest-mac.yml', Buffer.from(yml, 'utf8'), { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache' } });
  const download = fs.readFileSync('官网模块/正式官网-quizmate.vip/download.html');
  await client.put('download.html', download, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  console.log(JSON.stringify({ version, arm, intel, yml }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
