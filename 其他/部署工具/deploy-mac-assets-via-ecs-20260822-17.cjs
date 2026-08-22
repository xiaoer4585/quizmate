const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const REPOSITORY = 'xiaoer4585/quizmate';
const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const BUCKET = 'quizmate-cn';
const ASSETS = [
  {
    id: 525103215,
    name: 'QuizMate-Mac-Apple-Silicon-2026.8.22.5.dmg',
    object: 'downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.5.dmg',
    size: 126907604,
    contentType: 'application/x-apple-diskimage',
  },
  {
    id: 525103212,
    name: 'QuizMate-Mac-arm64-2026.8.22.5.zip',
    object: 'mac/QuizMate-Mac-arm64-2026.8.22.5.zip',
    size: 126885045,
    contentType: 'application/zip',
  },
  {
    id: 525103213,
    name: 'QuizMate-Mac-Intel-2026.8.22.5.dmg',
    object: 'downloads/QuizMate-Mac-Intel-2026.8.22.5.dmg',
    size: 130566970,
    contentType: 'application/x-apple-diskimage',
  },
  {
    id: 525103208,
    name: 'QuizMate-Mac-x64-2026.8.22.5.zip',
    object: 'mac/QuizMate-Mac-x64-2026.8.22.5.zip',
    size: 128991152,
    contentType: 'application/zip',
  },
];

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.aliyun', 'config.json'), 'utf8'));
const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
const auth = {
  ak: profile.access_key_id,
  sk: profile.access_key_secret,
  token: profile.sts_token || '',
};
const githubToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();

const storage = new OSS({
  region: REGION,
  endpoint: `https://oss-${REGION}.aliyuncs.com`,
  bucket: BUCKET,
  secure: true,
  accessKeyId: auth.ak,
  accessKeySecret: auth.sk,
  stsToken: auth.token || undefined,
  timeout: 1200000,
});

function pctEncode(value) {
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E');
}

function signEcs(query) {
  return crypto.createHmac('sha1', `${auth.sk}&`)
    .update(`GET&${pctEncode('/')}&${pctEncode(query)}`)
    .digest('base64');
}

async function callEcs(params) {
  const common = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: auth.ak,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    RegionId: REGION,
    ...(auth.token ? { SecurityToken: auth.token } : {}),
    ...params,
  };
  const query = Object.keys(common).sort()
    .map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`)
    .join('&');
  const response = await fetch(`https://ecs.${REGION}.aliyuncs.com/?${query}&Signature=${pctEncode(signEcs(query))}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runCommand(command) {
  const started = await callEcs({
    Action: 'RunCommand',
    Type: 'RunShellScript',
    'InstanceId.1': INSTANCE_ID,
    CommandContent: command,
    Timeout: '1200',
    ContentType: 'text/plain',
    EnableParameter: 'false',
    WorkingDir: '/root',
  });
  const deadline = Date.now() + 1260000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusResult = await callEcs({ Action: 'DescribeInvocations', InvokeId: started.InvokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await callEcs({
      Action: 'DescribeInvocationResults',
      InvokeId: started.InvokeId,
      InstanceId: INSTANCE_ID,
    });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8') : '';
    process.stdout.write(output);
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Remote transfer failed: ${status}`);
    }
    return output;
  }
  throw new Error('Remote transfer timed out');
}

function getReleaseAssetUrl(assetId) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPOSITORY}/releases/assets/${assetId}`,
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'QuizMate-release-publisher',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, (response) => {
      response.resume();
      if (response.statusCode !== 302 || !response.headers.location) {
        reject(new Error(`GitHub asset ${assetId} returned HTTP ${response.statusCode}`));
        return;
      }
      resolve(response.headers.location);
    });
    request.on('error', reject);
    request.end();
  });
}

async function headOrNull(object) {
  try {
    return await storage.head(object);
  } catch (error) {
    if (Number(error.status) === 404 || String(error.code).toLowerCase() === 'nosuchkey') return null;
    throw error;
  }
}

async function publishAsset(asset) {
  const existing = await headOrNull(asset.object);
  if (existing && Number(existing.res.headers['content-length']) === asset.size) {
    console.log(`OBJECT_OK ${BUCKET}/${asset.object} size=${asset.size}`);
    return;
  }
  if (existing) throw new Error(`Refusing to overwrite unexpected object ${asset.object}`);

  const sourceUrl = await getReleaseAssetUrl(asset.id);
  const targetUrl = storage.signatureUrl(asset.object, {
    expires: 1800,
    method: 'PUT',
    'Content-Type': asset.contentType,
  });
  const sourceB64 = Buffer.from(sourceUrl, 'utf8').toString('base64');
  const targetB64 = Buffer.from(targetUrl, 'utf8').toString('base64');
  const tempFile = `/tmp/quizmate-release-${asset.id}`;
  const command = `set -Eeuo pipefail
SOURCE_URL=$(printf %s '${sourceB64}' | base64 -d)
TARGET_URL=$(printf %s '${targetB64}' | base64 -d)
TEMP_FILE='${tempFile}'
cleanup() { rm -f "$TEMP_FILE"; }
trap cleanup EXIT
curl --fail --location --retry 5 --retry-all-errors --connect-timeout 30 --max-time 900 --output "$TEMP_FILE" "$SOURCE_URL"
ACTUAL_SIZE=$(stat -c%s "$TEMP_FILE")
test "$ACTUAL_SIZE" = '${asset.size}'
curl --fail --retry 5 --retry-all-errors --connect-timeout 30 --max-time 900 --request PUT --header 'Content-Type: ${asset.contentType}' --upload-file "$TEMP_FILE" "$TARGET_URL"
echo 'REMOTE_UPLOAD_OK name=${asset.name} size='"$ACTUAL_SIZE"`;
  const output = await runCommand(command);
  if (!output.includes(`REMOTE_UPLOAD_OK name=${asset.name} size=${asset.size}`)) {
    throw new Error(`Remote upload marker missing for ${asset.name}`);
  }

  const head = await storage.head(asset.object);
  const actualSize = Number(head.res.headers['content-length']);
  if (actualSize !== asset.size) {
    throw new Error(`OSS object size mismatch for ${asset.object}: ${actualSize} != ${asset.size}`);
  }
  console.log(`UPLOAD_VERIFY_OK ${BUCKET}/${asset.object} size=${actualSize}`);
}

async function main() {
  for (const asset of ASSETS) await publishAsset(asset);
  console.log(`DEPLOY_MAC_ASSETS_OK repository=${REPOSITORY} bucket=${BUCKET}`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
