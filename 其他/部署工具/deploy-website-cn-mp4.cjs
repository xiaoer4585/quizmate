// Upload the few remaining large media assets using the aliyun CLI, which
// streams files more reliably through the OSS public endpoint than the SDK's
// PUT does for big binaries.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE_ROOT = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const BUCKET = 'quizmate-cn';
const ENDPOINT = 'oss-cn-beijing.aliyuncs.com';

function cli(args) {
  return execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

const targets = [
  ['assets/desktop-demo.mp4', path.join(SITE_ROOT, 'assets/desktop-demo.mp4')],
  ['assets/android-demo.mp4', path.join(SITE_ROOT, 'assets/android-demo.mp4')],
];

for (const [rel, file] of targets) {
  console.log(`UPLOAD_START ${rel} ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)}MB`);
  try {
    cli(['oss', 'cp', file, `oss://${BUCKET}/${rel}`, '--endpoint', ENDPOINT, '--force']);
    console.log(`UPLOADED ${rel}`);
  } catch (err) {
    console.error(`UPLOAD_FAIL ${rel}: ${err.message}`);
    process.exitCode = 1;
  }
}