const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INSTANCE_ID = 'i-2zedgehm045w1gsarawx';
const REGION = 'cn-beijing';
const API_URL = 'https://api.quizmate.vip/study-auth-api';

function loadCredentials() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = config.profiles.find((item) => item.name === config.current) || config.profiles[0];
  if (!profile?.access_key_id || !profile?.access_key_secret) throw new Error('Aliyun CLI profile not found');
  return { ak: profile.access_key_id, sk: profile.access_key_secret, token: profile.sts_token || '' };
}

function pctEncode(value) {
  return encodeURIComponent(value).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function sign(canonicalQuery, secret) {
  return crypto.createHmac('sha1', `${secret}&`).update(`GET&${pctEncode('/')}&${pctEncode(canonicalQuery)}`).digest('base64');
}

async function callEcs(credentials, params) {
  const common = {
    Format: 'JSON', Version: '2014-05-26', AccessKeyId: credentials.ak,
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), RegionId: REGION,
    ...(credentials.token ? { SecurityToken: credentials.token } : {}), ...params
  };
  const keys = Object.keys(common).sort();
  const canonical = keys.map((key) => `${pctEncode(key)}=${pctEncode(common[key])}`).join('&');
  const url = `https://ecs.${REGION}.aliyuncs.com/?${canonical}&Signature=${pctEncode(sign(canonical, credentials.sk))}`;
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`ECS API ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function runCommand(credentials, command) {
  const started = await callEcs(credentials, {
    Action: 'RunCommand', Type: 'RunShellScript', 'InstanceId.1': INSTANCE_ID,
    CommandContent: command, Timeout: '300', ContentType: 'text/plain', EnableParameter: 'false', WorkingDir: '/root'
  });
  const invokeId = started.InvokeId;
  if (!invokeId) throw new Error('Cloud command did not start');
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const statusResult = await callEcs(credentials, { Action: 'DescribeInvocations', InvokeId: invokeId });
    const invocation = statusResult.Invocations?.Invocation?.[0];
    const instance = invocation?.InvokeInstances?.InvokeInstance?.[0];
    const status = instance?.InstanceInvokeStatus || invocation?.InvokeStatus;
    if (!status || ['Running', 'Pending'].includes(status)) continue;
    const result = await callEcs(credentials, { Action: 'DescribeInvocationResults', InvokeId: invokeId, InstanceId: INSTANCE_ID });
    const row = result.Invocation?.InvocationResults?.InvocationResult?.[0];
    const output = row?.Output ? Buffer.from(row.Output, 'base64').toString('utf8').trim() : '';
    if (!row || status === 'Failed' || (row.ExitCode != null && Number(row.ExitCode) !== 0)) {
      throw new Error(`Cloud command failed (${status}/${row?.ExitCode ?? 'unknown'}): ${output}`);
    }
    return output;
  }
  throw new Error('Cloud command timed out');
}

async function callAction(action, input = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'QuizMate-production-smoke/1.0' },
    body: JSON.stringify({ action, ...input })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    throw new Error(`${action} failed (${response.status}/${body.code || 'UNKNOWN'}): ${body.error || 'invalid response'}`);
  }
  return body.data;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function inspectPngDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('QR image is not a PNG data URL');
  const png = Buffer.from(match[1], 'base64');
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (width !== 260 || height !== 260 || bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) {
    throw new Error(`Unexpected QR PNG format ${width}x${height}, depth ${bitDepth}, color ${colorType}`);
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('Unexpected PNG scanline size');
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[previous + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[previous + x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3
        ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : null;
      if (predictor === null) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[row + x] = (value + predictor) & 0xff;
    }
  }
  let dark = 0;
  let light = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    const luminance = colorType === 0 || colorType === 4
      ? pixels[i]
      : Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    if (luminance < 64) dark += 1;
    if (luminance > 192) light += 1;
  }
  if (!dark || !light) throw new Error('QR PNG does not contain both dark and light pixels');
  return { width, height, bytes: png.length, darkPixels: dark, lightPixels: light };
}

async function main() {
  const credentials = loadCredentials();
  if (process.argv.includes('--health-only')) {
    const health = await runCommand(credentials, `set -Eeuo pipefail
set -a; . /etc/quizmate-api-shadow.env; set +a
echo SERVICE=\$(systemctl is-active quizmate-api-shadow.service)
curl -fsS http://127.0.0.1:8200/health
echo
psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -qAtc \"SELECT 'smoke_payable_order=' || count(*) FROM orders WHERE error_message = 'production QR smoke closed without payment' AND status IN ('created','waiting');\"`);
    if (!health.includes('SERVICE=active') || !health.includes('"status":"ok"') || !health.includes('"database":"ok"') || !health.includes('smoke_payable_order=0')) {
      throw new Error(`Production health verification failed: ${health}`);
    }
    console.log(health);
    return;
  }
  const accountId = crypto.randomUUID();
  const token = `acct_smoke_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const email = `payment-smoke-${Date.now()}@invalid.quizmate.vip`;
  let outTradeNo = '';
  let primaryError;

  try {
    await runCommand(credentials, `set -Eeuo pipefail
set -a; . /etc/quizmate-api-shadow.env; set +a
psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
INSERT INTO accounts(account_id, email, password_salt, password_hash, status)
VALUES ('${accountId}', '${email}', 'smoke', repeat('0', 64), 'active');
INSERT INTO credit_accounts(account_id, credits) VALUES ('${accountId}', 0);
INSERT INTO account_sessions(account_id, token_hash, device_id, platform, app_version, expires_at)
VALUES ('${accountId}', '${tokenHash}', 'production-payment-smoke', 'test', 'CHG-20260814-01', now() + interval '10 minutes');
COMMIT;
SQL
echo TEST_IDENTITY_READY`);

    const config = await callAction('getPaymentConfig');
    if (!config.creditEnabled || config.creditProvider !== 'epay' || !config.creditMethods?.includes('alipay')) {
      throw new Error('Production payment configuration is not ready for Alipay credit orders');
    }

    const order = await callAction('createCreditOrder', { accountToken: token, packageId: 'trial', method: 'alipay' });
    outTradeNo = String(order.outTradeNo || '');
    if (!outTradeNo || order.status !== 'waiting' || !order.payUrl || !order.qrCode) {
      throw new Error('Payment provider did not return a complete waiting order');
    }
    const png = inspectPngDataUrl(order.qrDataUrl);

    const query = await callAction('queryCreditOrder', { accountToken: token, outTradeNo });
    if (query.order?.status !== 'waiting' || query.creditedCredits !== 0 || query.account?.credits !== 0) {
      throw new Error(`Unexpected query state: ${query.order?.status || 'missing'}`);
    }
    console.log(JSON.stringify({
      ok: true,
      config: { creditEnabled: config.creditEnabled, provider: config.creditProvider, methods: config.creditMethods },
      order: { status: query.order.status, packageId: query.order.packageId, amount: query.order.amount, hasTradeNo: true, hasPayTarget: true },
      qrPng: png,
      query: { creditedCredits: query.creditedCredits, accountCredits: query.account.credits }
    }));
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      const tradeFilter = outTradeNo ? ` OR out_trade_no = '${outTradeNo}'` : '';
      const cleanup = await runCommand(credentials, `set -Eeuo pipefail
set -a; . /etc/quizmate-api-shadow.env; set +a
psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -qAt <<'SQL'
BEGIN;
UPDATE orders
   SET status = 'closed', account_id = NULL, email = NULL, qr_code = NULL, pay_url = NULL, qr_data_url = NULL,
       error_message = 'production QR smoke closed without payment', updated_at = now()
 WHERE account_id = '${accountId}'${tradeFilter};
DELETE FROM accounts WHERE account_id = '${accountId}';
COMMIT;
SELECT 'account=' || count(*) FROM accounts WHERE account_id = '${accountId}';
SELECT 'session=' || count(*) FROM account_sessions WHERE account_id = '${accountId}';
SELECT 'payable_order=' || count(*) FROM orders WHERE (account_id = '${accountId}'${tradeFilter}) AND status IN ('created','waiting');
SELECT 'closed_order=' || count(*) FROM orders WHERE out_trade_no = '${outTradeNo || 'none'}' AND status = 'closed' AND account_id IS NULL AND email IS NULL AND qr_code IS NULL AND pay_url IS NULL AND qr_data_url IS NULL;
SQL`);
      if (!cleanup.includes('account=0') || !cleanup.includes('session=0') || !cleanup.includes('payable_order=0') || (outTradeNo && !cleanup.includes('closed_order=1'))) {
        throw new Error(`Cleanup verification failed: ${cleanup}`);
      }
      console.log(JSON.stringify({ cleanup: { account: 0, session: 0, payableOrders: 0, closedSanitizedOrder: outTradeNo ? 1 : 0 } }));
    } catch (cleanupError) {
      if (primaryError) primaryError = new Error(`${primaryError.message}; cleanup also failed: ${cleanupError.message}`);
      else primaryError = cleanupError;
    }
  }
  if (primaryError) throw primaryError;
}

main().catch((error) => {
  process.stderr.write(`PAYMENT_QR_SMOKE_FAILED ${error.message}\n`);
  process.exitCode = 1;
});
