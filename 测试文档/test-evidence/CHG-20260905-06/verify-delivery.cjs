const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const OSS = require(require.resolve('ali-oss', { paths: [path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules')] }));
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const p = cfg.profiles.find((x) => x.name === cfg.current) || cfg.profiles[0];
const oss = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: p.access_key_id, accessKeySecret: p.access_key_secret, stsToken: p.sts_token || undefined });
const prefix = 'temp/mac-delivery-20260905-shortcut-fix-1';
const files = [
  ['QuizMate-Mac-Intel-2026.09.05.2.dmg', '4fe7da4de8a05728396f748a784d0ecfa3497fb75f2a49db7d3d0a9d365c719a'],
  ['QuizMate-Mac-x64-2026.09.05.2.zip', '490b7d3a5dec5a186e439ace449ebc8a8b5a3f3d627e6dd17376e3c4b361b219'],
  ['QuizMate-Mac-Apple-Silicon-2026.09.05.2.dmg', '19c62e1b14f21efa1993dea19b193b9b00709e297266e37ea24f84167e418a5f'],
  ['QuizMate-Mac-arm64-2026.09.05.2.zip', 'a9386ddf2eac0d75999d19f91cf39ca120267d6f156808d78c28aeb44a4c5fad'],
];
async function main() {
  for (const [name, expected] of files) {
    const object = `${prefix}/${name}`;
    const head = await oss.head(object);
    const stream = await oss.getStream(object);
    const hash = crypto.createHash('sha256'); let bytes = 0;
    for await (const chunk of stream.stream) { bytes += chunk.length; hash.update(chunk); }
    const sha = hash.digest('hex');
    if (bytes !== Number(head.res.headers['content-length']) || sha !== expected) throw new Error(`integrity mismatch ${name}`);
    const response = await fetch(`https://quizmate.cn/${object}`, { headers: { Range: 'bytes=0-1023' } });
    const rangeBytes = Buffer.from(await response.arrayBuffer()).length;
    if (response.status !== 206 || rangeBytes !== 1024) throw new Error(`range mismatch ${name}`);
    console.log(`VERIFY_OK ${name} bytes=${bytes} sha256=${sha} range=${response.status}`);
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
