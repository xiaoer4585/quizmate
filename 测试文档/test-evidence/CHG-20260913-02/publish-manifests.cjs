const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require(require.resolve('ali-oss', { paths: [path.resolve(__dirname, '../../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules')] }));

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = cfg.profiles.find((item) => item.name === cfg.current) || cfg.profiles[0];
const storage = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret, stsToken: profile.sts_token || undefined });
const change = 'CHG-20260913-02';
async function digest(object) {
  const response = await storage.getStream(object);
  const sha512 = crypto.createHash('sha512');
  let size = 0;
  for await (const chunk of response.stream) { sha512.update(chunk); size += chunk.length; }
  return { size, sha512: sha512.digest('base64') };
}
async function backup(object) {
  const target = `rollback/${change}/${object}`;
  try { await storage.head(target); return; } catch (error) { if (Number(error.status) !== 404 && String(error.code).toLowerCase() !== 'nosuchkey') throw error; }
  await storage.copy(target, object, { headers: { 'Cache-Control': 'no-cache' } });
}
async function put(object, text) { await storage.put(object, Buffer.from(text, 'utf8'), { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' } }); }
async function main() {
  const win = await digest('suite/QuizMate-Windows-2026.09.10.exe');
  const arm = await digest('mac/QuizMate-Mac-arm64-2026.09.12.zip');
  const intel = await digest('mac/QuizMate-Mac-x64-2026.09.12.zip');
  const releaseDate = new Date().toISOString();
  const windows = [`version: 2026.9.10000`, 'files:', `  - url: QuizMate-Windows-2026.09.10.exe`, `    sha512: ${win.sha512}`, `    size: ${win.size}`, 'path: QuizMate-Windows-2026.09.10.exe', `sha512: ${win.sha512}`, `releaseDate: '${releaseDate}'`, ''].join('\n');
  const mac = [`version: 2026.9.12000`, 'files:', `  - url: QuizMate-Mac-arm64-2026.09.12.zip`, `    sha512: ${arm.sha512}`, `    size: ${arm.size}`, `  - url: QuizMate-Mac-x64-2026.09.12.zip`, `    sha512: ${intel.sha512}`, `    size: ${intel.size}`, 'path: QuizMate-Mac-arm64-2026.09.12.zip', `sha512: ${arm.sha512}`, `releaseDate: '${releaseDate}'`, ''].join('\n');
  for (const object of ['suite/latest.yml', 'downloads/latest.yml', 'mac/latest-mac.yml', 'downloads/QuizMate-Windows-2026.09.10.exe', 'downloads/QuizMate-Windows-2026.09.10.exe.blockmap']) await backup(object);
  await storage.copy('downloads/QuizMate-Windows-2026.09.10.exe', 'suite/QuizMate-Windows-2026.09.10.exe', { headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  await storage.copy('downloads/QuizMate-Windows-2026.09.10.exe.blockmap', 'suite/QuizMate-Windows-2026.09.10.exe.blockmap', { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  await put('suite/latest.yml', windows); await put('downloads/latest.yml', windows); await put('mac/latest-mac.yml', mac);
  console.log(JSON.stringify({ change, windows, mac }, null, 2));
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
