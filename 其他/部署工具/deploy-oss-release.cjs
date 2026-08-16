const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

async function main() {
  const [objectName, sourceFile, contentType] = process.argv.slice(2);
  if (!objectName || !sourceFile || !contentType) {
    throw new Error('Usage: node scripts/deploy-oss-release.cjs <object> <file> <content-type>');
  }

  const aliyunConfig = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
  );
  const profile = aliyunConfig.profiles.find((item) => item.name === aliyunConfig.current);
  if (!profile) throw new Error('Current Aliyun CLI profile not found');

  const client = new OSS({
    endpoint: 'https://www.quizmate.vip',
    cname: true,
    bucket: 'quizmate-vip',
    secure: true,
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
    stsToken: profile.sts_token,
    timeout: 1_200_000,
  });

  const sourcePath = path.resolve(sourceFile);
  let lastReported = -1;
  const result = await client.multipartUpload(objectName, sourcePath, {
    parallel: 16,
    partSize: 1024 * 1024,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
    progress: (percentage) => {
      const whole = Math.floor(percentage * 100);
      if (whole >= lastReported + 5) {
        lastReported = whole;
        process.stdout.write(`PROGRESS ${whole}%\n`);
      }
    },
  });
  process.stdout.write(`UPLOAD_OK ${result.res.status}\n`);
}

main().catch((error) => {
  process.stderr.write(`UPLOAD_FAIL ${error.name || ''} ${error.status || ''} ${error.code || ''} ${error.message}\n`);
  process.exitCode = 1;
});
