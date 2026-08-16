const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

function loadCredentials() {
  if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    return {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    };
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'),
  );
  const profile = config.profiles.find((item) => item.name === config.current);
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return {
    accessKeyId: profile.access_key_id,
    accessKeySecret: profile.access_key_secret,
  };
}

// 编码验证：检测双重 UTF-8 编码乱码（文本类文件才检查）
function verifyEncoding(filePath, contentType) {
  if (!/text\/|javascript|css|html|json|xml/.test(contentType)) return;
  const buf = fs.readFileSync(filePath);
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let doubleEncodedCount = 0;
  for (let i = 0; i < sample.length - 2; i++) {
    if ((sample[i] === 0xc3 || sample[i] === 0xc2) && sample[i + 1] >= 0x80 && sample[i + 1] <= 0xbf) {
      if (sample[i + 2] === 0xc3 || sample[i + 2] === 0xc2) doubleEncodedCount++;
    }
  }
  if (doubleEncodedCount > 5) {
    throw new Error(`编码验证失败: ${filePath} 疑似双重 UTF-8 编码乱码 (检测到 ${doubleEncodedCount} 处特征)。请用 UTF-8 编码重新保存后再部署。`);
  }
}

async function main() {
  const [objectName, sourceFile, contentType] = process.argv.slice(2);
  if (!objectName || !sourceFile || !contentType) {
    throw new Error('Usage: node scripts/deploy-oss-direct.cjs <object> <file> <content-type>');
  }

  // 上传前编码验证
  verifyEncoding(sourceFile, contentType);

  const credentials = loadCredentials();
  const client = new OSS({
    endpoint: 'https://www.quizmate.vip',
    cname: true,
    bucket: 'quizmate-vip',
    secure: true,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
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
