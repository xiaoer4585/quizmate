const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const changeId = 'CHG-20260812-01';
const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const files = [
  ['recharge.html', 'text/html; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
];

function loadCredentials() {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
  );
  const profile = config.profiles.find((item) => item.name === config.current);
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return { accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// 历史脚本（CHG-20260812-01）。quizmate-vip bucket 现在只做跳转，官网文件一律部署到 quizmate-cn。
const client = new OSS({
  region: 'cn-beijing',
  endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  bucket: 'quizmate-cn',
  secure: true,
  timeout: 120_000,
  ...loadCredentials(),
});

async function main() {
  for (const [objectName] of files) {
    const backupName = `rollback/${changeId}/${objectName}.before-countdown`;
    await client.copy(backupName, objectName);
    const backupHead = await client.head(backupName);
    process.stdout.write(`BACKUP_OK ${backupName} ${backupHead.res.headers['content-length']} bytes\n`);
  }

  for (const [objectName, contentType] of files) {
    const localPath = path.join(siteRoot, objectName);
    const local = fs.readFileSync(localPath);
    const result = await client.put(objectName, localPath, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
    });
    if (result.res.status !== 200) throw new Error(`Upload failed: ${objectName}`);

    const remote = await client.get(objectName);
    if (sha256(remote.content) !== sha256(local)) throw new Error(`Hash mismatch: ${objectName}`);
    process.stdout.write(`UPLOAD_VERIFY_OK ${objectName} ${local.length} bytes sha256=${sha256(local)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAIL ${error.code || ''} ${error.message}\n`);
  process.exitCode = 1;
});
