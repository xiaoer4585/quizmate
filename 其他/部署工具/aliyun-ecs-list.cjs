// 用阿里云 ECS OpenAPI 列出实例（纯 fetch + ACS v3 签名）
const crypto = require('crypto');

const AK_ID = process.env.OSS_AK_ID;
const AK_SECRET = process.env.OSS_AK_SECRET;
if (!AK_ID || !AK_SECRET) throw new Error('OSS_AK_ID/OSS_AK_SECRET env required');

function pctEncode(s) {
  return encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function sign(method, canonicalQuery, secret) {
  return crypto.createHmac('sha1', secret + '&').update(method + '&' + pctEncode('/') + '&' + pctEncode(canonicalQuery)).digest('base64');
}

async function callEcs(params, region = 'cn-beijing') {
  const common = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: AK_ID,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    RegionId: region,
    ...params,
  };
  const keys = Object.keys(common).sort();
  const canonical = keys.map((k) => pctEncode(k) + '=' + pctEncode(common[k])).join('&');
  const signature = sign('GET', canonical, AK_SECRET);
  const url = `https://ecs.${region}.aliyuncs.com/?${keys.map((k) => pctEncode(k) + '=' + pctEncode(common[k])).join('&')}&Signature=${pctEncode(signature)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`ECS API ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  // 先探测 region，quizmate 生产在 cn-beijing
  const data = await callEcs({ Action: 'DescribeInstances', PageSize: '50' }, 'cn-beijing');
  if (!data.Instances || !data.Instances.Instance) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const list = data.Instances.Instance;
  process.stdout.write(`TOTAL=${list.length} Region=cn-beijing\n`);
  for (const ins of list) {
    const pubIp = (ins.PublicIpAddress && ins.PublicIpAddress.IpAddress && ins.PublicIpAddress.IpAddress.join(',')) || '-';
    const eip = (ins.EipAddress && ins.EipAddress.IpAddress) || '-';
    const tags = (ins.Tags && ins.Tags.Tag && ins.Tags.Tag.map((t) => `${t.TagKey}=${t.TagValue}`).join(',')) || '-';
    process.stdout.write(`InstanceId=${ins.InstanceId} Name=${ins.InstanceName} Status=${ins.Status} IP=${ins.InstanceNetworkType === 'vpc' ? 'vpc' : ins.InstanceNetworkType} PubIP=${pubIp} EIP=${eip} OS=${ins.OSName || ins.ImageId} Tags=${tags}\n`);
  }
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
