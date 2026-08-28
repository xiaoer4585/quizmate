const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const changeId = 'CHG-20260819-RECHARGE-PROMO';
const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const files = [
  ['recharge.html', 'text/html; charset=utf-8'],
  ['credits.js', 'application/javascript; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
];

function loadCredentials() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = config.profiles.find((item) => item.name === (config.current || 'default')) || config.profiles[0];
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return { accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const client = new OSS({
  region: 'cn-beijing',
  endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  bucket: 'quizmate-cn',
  secure: true,
  timeout: 120000,
  ...loadCredentials(),
});

async function main() {
  for (const [objectName] of files) {
    const backupName = `rollback/${changeId}/${objectName}`;
    await client.copy(backupName, objectName);
    const backupHead = await client.head(backupName);
    process.stdout.write(`BACKUP_OK ${backupName} ${backupHead.res.headers['content-length']} bytes\n`);
  }

  for (const [objectName, contentType] of files) {
    const localPath = path.join(siteRoot, objectName);
    const local = fs.readFileSync(localPath);
    await client.put(objectName, localPath, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
    });
    const remote = await client.get(objectName);
    const localHash = sha256(local);
    if (sha256(remote.content) !== localHash) throw new Error(`Hash mismatch: ${objectName}`);
    process.stdout.write(`UPLOAD_VERIFY_OK ${objectName} ${local.length} bytes sha256=${localHash}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAIL ${error.code || ''} ${error.message}\n`);
  process.exitCode = 1;
});
