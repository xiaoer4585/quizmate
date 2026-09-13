const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const profile = cfg.profiles.find((item) => item.name === cfg.current) || cfg.profiles[0];
const auth = { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
const storage = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: auth.ak, accessKeySecret: auth.sk, stsToken: auth.token || undefined });
const encode = (value) => encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/~/g, '%7E');
const sign = (query) => crypto.createHmac('sha1', `${auth.sk}&`).update(`GET&${encode('/')}&${encode(query)}`).digest('base64');
async function ecs(params) {
  const common = { Format: 'JSON', Version: '2014-05-26', AccessKeyId: auth.ak, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: 'cn-beijing', ...(auth.token ? { SecurityToken: auth.token } : {}), ...params };
  const query = Object.keys(common).sort().map((key) => `${encode(key)}=${encode(common[key])}`).join('&');
  const response = await fetch(`https://ecs.cn-beijing.aliyuncs.com/?${query}&Signature=${encode(sign(query))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(body);
  return JSON.parse(body);
}
async function remote(command) {
  const started = await ecs({ Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': 'i-2zedgehm045w1gsarawx', CommandContent: command, Timeout: '1800', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root' });
  for (let i = 0; i < 700; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await ecs({ Action: 'DescribeInvocationResults', InvokeId: started.InvokeId, InstanceId: 'i-2zedgehm045w1gsarawx' });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (!row || row.InvocationStatus === 'Running' || row.InvocationStatus === 'Pending') continue;
    const output = row.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (Number(row.ExitCode) !== 0) throw new Error('backend rollback failed');
    return;
  }
  throw new Error('backend rollback timed out');
}
async function main() {
  for (const object of ['suite/latest.yml', 'downloads/latest.yml', 'mac/latest-mac.yml', 'downloads/QuizMate-Windows-2026.09.10.exe', 'downloads/QuizMate-Windows-2026.09.10.exe.blockmap']) {
    await storage.copy(object, `rollback/CHG-20260913-02/${object}`, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    console.log(`RESTORED ${object}`);
  }
  const command = [
    'set -Eeuo pipefail',
    'APP=/opt/quizmate-api-shadow',
    'BACKUP=/opt/quizmate-api-shadow.rollback-CHG-20260913-02-20260913-175940',
    'test -d "$BACKUP/actions"',
    'cp -a "$BACKUP/actions/." "$APP/dist/src/actions/"',
    'systemctl restart quizmate-api-shadow.service',
    'sleep 3',
    'test "$(systemctl is-active quizmate-api-shadow.service)" = active',
    'curl -fsS http://127.0.0.1:8200/health',
    'echo',
    'echo BACKEND_ROLLBACK_OK'
  ].join('\n');
  await remote(command);

  await storage.copy('suite/QuizMate-Windows-2026.09.10.exe', 'downloads/QuizMate-Windows-2026.09.10.exe', { headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  await storage.copy('suite/QuizMate-Windows-2026.09.10.exe.blockmap', 'downloads/QuizMate-Windows-2026.09.10.exe.blockmap', { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  console.log('RESTORED suite Windows package');

  const macAssets = [
    ['QuizMate-Mac-Intel-2026.09.12.dmg', 'downloads/QuizMate-Mac-Intel-2026.09.12.dmg', 'application/x-apple-diskimage', 117906066, 557673008],
    ['QuizMate-Mac-Apple-Silicon-2026.09.12.dmg', 'downloads/QuizMate-Mac-Apple-Silicon-2026.09.12.dmg', 'application/x-apple-diskimage', 109495432, 557672095],
    ['QuizMate-Mac-x64-2026.09.12.zip', 'mac/QuizMate-Mac-x64-2026.09.12.zip', 'application/zip', 112324226, 557673011],
    ['QuizMate-Mac-arm64-2026.09.12.zip', 'mac/QuizMate-Mac-arm64-2026.09.12.zip', 'application/zip', 105328604, 557672091]
  ];
  const chunkCount = 13;
  const macJobs = macAssets.map(async ([name, object, contentType, size, assetId]) => {
    const macCommands = ['set -Eeuo pipefail'];
    const response = await fetch(`https://api.github.com/repos/xiaoer4585/quizmate/releases/assets/${assetId}`, { redirect: 'manual', headers: { Accept: 'application/octet-stream', 'User-Agent': 'QuizMate-Rollback' } });
    const source = response.headers.get('location');
    if (!source) throw new Error(`GitHub asset redirect unavailable for ${name}: ${response.status}`);
    macCommands.push(`SOURCE='${source}'`);
    const chunkSize = Math.ceil(size / chunkCount);
    if (process.env.UPLOAD_ONLY !== '1') {
      macCommands.push(`rm -f '/tmp/${name}' /tmp/'${name}'.part-*`);
      for (let part = 0; part < chunkCount; part += 1) {
        const start = part * chunkSize;
        const end = Math.min(size - 1, start + chunkSize - 1);
        const suffix = String(part).padStart(2, '0');
        macCommands.push(`curl -sS -fL --retry 10 --connect-timeout 20 -r '${start}-${end}' -o '/tmp/${name}.part-${suffix}' "$SOURCE" &`);
      }
      macCommands.push('wait');
      const parts = Array.from({ length: chunkCount }, (_, part) => `/tmp/${name}.part-${String(part).padStart(2, '0')}`).join(' ');
      macCommands.push(`cat ${parts} > '/tmp/${name}'`);
    }
    const target = storage.signatureUrl(object, { expires: 3600, method: 'PUT', 'Content-Type': contentType }).replace('oss-cn-beijing.aliyuncs.com', 'oss-cn-beijing-internal.aliyuncs.com');
    macCommands.push(`test "$(stat -c %s '/tmp/${name}')" = '${size}'`);
    macCommands.push(`curl -fsS --retry 5 -X PUT -H 'Content-Type: ${contentType}' --upload-file '/tmp/${name}' '${target}'`);
    macCommands.push(`echo 'RESTORED ${object} size=${size}'`);
    await remote(macCommands.join('\n'));
  });
  await Promise.all(macJobs);
  console.log('MAC_PACKAGES_ROLLBACK_OK');
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
