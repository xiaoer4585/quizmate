// Windows 2026.8.27.2 production release.
// Keeps Electron/update metadata on valid SemVer 2026.8.27002 while exposing
// the business version 2026.8.27.2 in filenames and website copy.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const moduleRoots = [
  path.join(ROOT, '注册登陆模块/阿里云统一入口-study-auth-api/node_modules'),
  process.env.QUIZMATE_NODE_MODULES,
].filter(Boolean);
const OSS = require(require.resolve('ali-oss', { paths: moduleRoots }));

const INTERNAL_VERSION = '2026.8.27002';
const BUSINESS_VERSION = '2026.8.27.2';
const CHANGE_ID = 'CHG-20260828-03-WIN';
const RELEASE_TAG = 'windows-build-manual-33';
const EXE_NAME = `QuizMate-Windows-${BUSINESS_VERSION}.exe`;
const BLOCKMAP_NAME = `${EXE_NAME}.blockmap`;
const RELEASE_DIR = process.env.QUIZMATE_RELEASE_DIR || path.join(
  ROOT,
  'windows客户端/QuizMate-Windows/releases/2026-08-28-prod',
);
const EXE_URL = `https://github.com/xiaoer4585/quizmate/releases/download/${RELEASE_TAG}/${EXE_NAME}`;
const EXPECTED_EXE_SIZE = 82820119;
const EXPECTED_EXE_SHA256 = '0085cef218621979d7b5d9bcfd4dcd150d1cb7b6e24d386229ffc0052143bba0';
const STAGE_EXE = `temp/${CHANGE_ID}/${EXE_NAME}`;
const REGION = 'cn-beijing';
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';

const files = {
  exe: path.join(RELEASE_DIR, EXE_NAME),
  blockmap: path.join(RELEASE_DIR, BLOCKMAP_NAME),
  latest: path.join(RELEASE_DIR, 'latest.yml'),
  appUpdate: path.join(RELEASE_DIR, 'app-update.yml'),
  download: path.join(ROOT, '官网模块/正式官网-quizmate.vip/download.html'),
  index: path.join(ROOT, '官网模块/正式官网-quizmate.vip/index.html'),
  article: path.join(ROOT, '官网模块/正式官网-quizmate.vip/blog/article-exam-skills.html'),
};

const mutableObjects = [
  'suite/latest.yml',
  'downloads/latest.yml',
  'download.html',
  'index.html',
  'blog/article-exam-skills.html',
];

function profile() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const item = config.profiles.find((value) => value.name === config.current) || config.profiles[0];
  if (!item?.access_key_id || !item?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  return item;
}

function client(item) {
  return new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    accessKeyId: item.access_key_id,
    accessKeySecret: item.access_key_secret,
    stsToken: item.sts_token || undefined,
    timeout: 1_200_000,
  });
}

function assertLocalInputs() {
  for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) throw new Error(`Missing release input: ${file}`);
  }
  const latest = fs.readFileSync(files.latest, 'utf8');
  const appUpdate = fs.readFileSync(files.appUpdate, 'utf8');
  if (!latest.includes(`version: ${INTERNAL_VERSION}`)) throw new Error('latest.yml internal version mismatch');
  if (!latest.includes(EXE_NAME)) throw new Error('latest.yml public filename mismatch');
  if (!latest.includes(`size: ${EXPECTED_EXE_SIZE}`)) throw new Error('latest.yml size mismatch');
  if (!appUpdate.includes('url: https://quizmate.cn/suite/')) throw new Error('production app-update.yml URL mismatch');
  for (const page of [files.download, files.index, files.article]) {
    const html = fs.readFileSync(page, 'utf8');
    if (!html.includes(EXE_NAME)) throw new Error(`Website page does not link ${EXE_NAME}: ${page}`);
  }
  console.log(`PRECHECK_OK internal=${INTERNAL_VERSION} business=${BUSINESS_VERSION}`);
}

async function waitForAsyncFetch(storage, taskId) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await storage.getAsyncFetch(taskId);
    const state = String(result.state || '').toLowerCase();
    if (state === 'success') return;
    if (state === 'failed') throw new Error(`OSS async fetch failed: ${JSON.stringify(result.taskInfo || {})}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('OSS async fetch timed out');
}

function pctEncode(value) {
  return encodeURIComponent(value)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function ecsSign(query, secret) {
  return crypto.createHmac('sha1', `${secret}&`)
    .update(`GET&${pctEncode('/')}&${pctEncode(query)}`)
    .digest('base64');
}

async function callEcs(auth, params) {
  const common = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: auth.access_key_id,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    RegionId: REGION,
    ...(auth.sts_token ? { SecurityToken: auth.sts_token } : {}),
    ...params,
  };
  const query = Object.keys(common).sort().map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`).join('&');
  const response = await fetch(
    `https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${pctEncode(ecsSign(query, auth.access_key_secret))}`,
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runRemoteCommand(auth, command) {
  const started = await callEcs(auth, {
    Action: 'RunCommand',
    Type: 'RunShellScript',
    'InstanceId.1': INSTANCE_ID,
    CommandContent: command,
    Timeout: '900',
    ContentType: 'text/plain',
    EnableParameter: 'false',
    WorkingDir: '/root',
  });
  const deadline = Date.now() + 960_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await callEcs(auth, { Action: 'DescribeInvocations', InvokeId: started.InvokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await callEcs(auth, {
      Action: 'DescribeInvocationResults',
      InvokeId: started.InvokeId,
      InstanceId: INSTANCE_ID,
    });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Remote installer staging failed: ${status}`);
    }
    return;
  }
  throw new Error('Remote installer staging timed out');
}

async function fetchThroughEcs(storage, auth) {
  const contentType = 'application/vnd.microsoft.portable-executable';
  const putUrl = storage.signatureUrl(STAGE_EXE, {
    expires: 3600,
    method: 'PUT',
    'Content-Type': contentType,
  });
  const sourceB64 = Buffer.from(EXE_URL).toString('base64');
  const targetB64 = Buffer.from(putUrl).toString('base64');
  await runRemoteCommand(auth, `set -Eeuo pipefail
src=$(printf '%s' '${sourceB64}' | base64 -d)
dst=$(printf '%s' '${targetB64}' | base64 -d)
tmp=$(mktemp /tmp/quizmate-windows-XXXXXX.exe)
trap 'rm -f "$tmp"' EXIT
curl --fail --location --retry 5 --connect-timeout 30 --output "$tmp" "$src"
test "$(stat -c %s "$tmp")" = '${EXPECTED_EXE_SIZE}'
test "$(sha256sum "$tmp" | awk '{print $1}')" = '${EXPECTED_EXE_SHA256}'
curl --fail --silent --show-error --retry 5 -X PUT -H 'Content-Type: ${contentType}' --upload-file "$tmp" "$dst"
echo REMOTE_STAGE_OK size=$(stat -c %s "$tmp") sha256=$(sha256sum "$tmp" | awk '{print $1}')`);
}

async function fetchInstaller(storage, auth) {
  if (fs.existsSync(files.exe) && fs.statSync(files.exe).size === EXPECTED_EXE_SIZE) {
    const localHash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(files.exe)) localHash.update(chunk);
    const digest = localHash.digest('hex');
    if (digest !== EXPECTED_EXE_SHA256) throw new Error(`Local EXE digest mismatch: ${digest}`);
    await storage.multipartUpload(STAGE_EXE, files.exe, {
      parallel: 16,
      partSize: 1024 * 1024,
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Cache-Control': 'no-cache',
      },
    });
    console.log(`LOCAL_STAGE_UPLOAD_OK sha256=${digest}`);
  } else {
    try {
      const task = await storage.postAsyncFetch(STAGE_EXE, EXE_URL, { ignoreSameKey: false });
      console.log(`ASYNC_FETCH_STARTED task=${task.taskId}`);
      await waitForAsyncFetch(storage, task.taskId);
    } catch (error) {
      const label = `${error.code || ''} ${error.name || ''}`.toLowerCase();
      if (!label.includes('operationnotsupported')) throw error;
      console.log('ASYNC_FETCH_UNSUPPORTED fallback=ECS-cloud-assistant');
      await fetchThroughEcs(storage, auth);
    }
  }
  const head = await storage.head(STAGE_EXE);
  const size = Number(head.res.headers['content-length']);
  if (size !== EXPECTED_EXE_SIZE) throw new Error(`Staged EXE size mismatch: ${size}`);

  const response = await storage.getStream(STAGE_EXE);
  const hash = crypto.createHash('sha256');
  let streamed = 0;
  for await (const chunk of response.stream) {
    hash.update(chunk);
    streamed += chunk.length;
  }
  const digest = hash.digest('hex');
  if (streamed !== EXPECTED_EXE_SIZE || digest !== EXPECTED_EXE_SHA256) {
    throw new Error(`Staged EXE digest mismatch: size=${streamed} sha256=${digest}`);
  }
  console.log(`STAGE_VERIFY_OK size=${streamed} sha256=${digest}`);
}

async function backup(storage, object) {
  const rollback = `rollback/${CHANGE_ID}/${object}`;
  await storage.head(object);
  await storage.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`BACKUP_OK ${object} -> ${rollback}`);
}

async function restore(storage) {
  for (const object of mutableObjects) {
    const rollback = `rollback/${CHANGE_ID}/${object}`;
    try {
      await storage.copy(object, rollback, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`ROLLBACK_OK ${object}`);
    } catch (error) {
      console.error(`ROLLBACK_FAILED ${object}: ${error.message}`);
    }
  }
}

async function put(storage, object, file, contentType) {
  await storage.put(object, file, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
  console.log(`UPLOAD_OK ${object}`);
}

async function publish(storage) {
  for (const object of mutableObjects) await backup(storage, object);

  for (const prefix of ['suite', 'downloads']) {
    await storage.copy(`${prefix}/${EXE_NAME}`, STAGE_EXE, {
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Cache-Control': 'no-cache',
      },
    });
    await put(storage, `${prefix}/${BLOCKMAP_NAME}`, files.blockmap, 'application/octet-stream');
  }

  await put(storage, 'suite/latest.yml', files.latest, 'text/yaml; charset=utf-8');
  await put(storage, 'downloads/latest.yml', files.latest, 'text/yaml; charset=utf-8');
  await put(storage, 'download.html', files.download, 'text/html; charset=utf-8');
  await put(storage, 'index.html', files.index, 'text/html; charset=utf-8');
  await put(storage, 'blog/article-exam-skills.html', files.article, 'text/html; charset=utf-8');
}

async function verify(storage) {
  for (const prefix of ['suite', 'downloads']) {
    const head = await storage.head(`${prefix}/${EXE_NAME}`);
    if (Number(head.res.headers['content-length']) !== EXPECTED_EXE_SIZE) throw new Error(`${prefix} EXE size mismatch`);
    await storage.head(`${prefix}/${BLOCKMAP_NAME}`);
  }
  for (const key of ['suite/latest.yml', 'downloads/latest.yml']) {
    const response = await storage.get(key);
    const text = response.content.toString('utf8');
    if (!text.includes(`version: ${INTERNAL_VERSION}`) || !text.includes(EXE_NAME)) {
      throw new Error(`${key} verification failed`);
    }
  }
  for (const key of ['download.html', 'index.html', 'blog/article-exam-skills.html']) {
    const response = await storage.get(key);
    if (!response.content.toString('utf8').includes(EXE_NAME)) throw new Error(`${key} verification failed`);
  }
  console.log(`POSTVERIFY_OK version=${INTERNAL_VERSION} business=${BUSINESS_VERSION}`);
}

async function main() {
  assertLocalInputs();
  const auth = profile();
  const storage = client(auth);
  await fetchInstaller(storage, auth);
  try {
    await publish(storage);
    await verify(storage);
  } catch (error) {
    await restore(storage);
    throw error;
  }
  console.log(`DEPLOY_WINDOWS_SEMVER_RELEASE_OK change=${CHANGE_ID}`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
