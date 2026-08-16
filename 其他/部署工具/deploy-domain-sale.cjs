// CHG-20260803 售卖页部署到香港 OSS
// 1. 建桶 2. 上传 index.html 3. 静态托管 4. 两个域名 CnameToken + TXT验证 + PutCname + CNAME
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BUCKET = 'domain-sale-hk';
const ENDPOINT = 'oss-cn-hongkong.aliyuncs.com';
const REGION = 'cn-hongkong';
const INDEX_FILE = path.resolve(__dirname, '../../域名售卖页/index.html');
const TMP_DIR = path.resolve(__dirname, '../tmp');
const DOMAINS = ['bulidmate.com', 'bulidbuddy.com'];

function run(args, opts = {}) {
  const out = execFileSync('aliyun', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  return out.trim();
}

function oss(args) {
  return run(['oss', ...args, '--endpoint', ENDPOINT]);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // 1. 创建 bucket（如已存在会报错，忽略）
  process.stdout.write('=== STEP 1: create bucket ===\n');
  try {
    oss(['mb', `oss://${BUCKET}`]);
    process.stdout.write('BUCKET_CREATED\n');
  } catch (e) {
    if (String(e.stdout || e.message).includes('already')) {
      process.stdout.write('BUCKET_EXISTS\n');
    } else {
      // mb 失败可能是已存在或其他错误，先继续后续步骤
      process.stdout.write('MB_SKIP: ' + String(e.stdout || e.message).slice(0, 200) + '\n');
    }
  }

  // 2. 上传 index.html
  process.stdout.write('=== STEP 2: upload index.html ===\n');
  oss(['cp', INDEX_FILE, `oss://${BUCKET}/index.html`, '--force']);
  process.stdout.write('UPLOAD_OK\n');

  // 3. 配置静态网站托管
  process.stdout.write('=== STEP 3: configure static website ===\n');
  const websiteXml = `<?xml version="1.0" encoding="UTF-8"?>
<WebsiteConfiguration>
  <IndexDocument>
    <Suffix>index.html</Suffix>
  </IndexDocument>
  <ErrorDocument>
    <Key>index.html</Key>
  </ErrorDocument>
</WebsiteConfiguration>`;
  const xmlFile = path.join(TMP_DIR, 'website-config.xml');
  fs.writeFileSync(xmlFile, websiteXml, 'utf8');
  oss(['website', '--method', 'put', `oss://${BUCKET}`, xmlFile]);
  process.stdout.write('WEBSITE_OK\n');

  // 4. 读取 index.html 内容验证
  const stat = oss(['stat', `oss://${BUCKET}/index.html`]);
  process.stdout.write('STAT:\n' + stat.slice(0, 500) + '\n');

  // 5. 对每个域名执行 CnameToken + TXT + PutCname + CNAME
  for (const domain of DOMAINS) {
    process.stdout.write(`\n=== DOMAIN: ${domain} ===\n`);

    // 5a. 检查是否已有CNAME记录指向bucket（可能之前配置过）
    let cnameExists = false;
    try {
      const recs = run(['alidns', 'DescribeDomainRecords', '--DomainName', domain]);
      const parsed = JSON.parse(recs);
      const records = parsed.DomainRecords.Record || [];
      const bucketTarget = `${BUCKET}.${ENDPOINT}`;
      const existingCname = records.find((r) => r.Type === 'CNAME' && r.RR === '@');
      if (existingCname) {
        process.stdout.write(`EXISTING_CNAME: @ -> ${existingCname.Value}\n`);
        if (existingCname.Value === bucketTarget) cnameExists = true;
      }
    } catch (e) {
      process.stdout.write('CHECK_CNAME_SKIP: ' + String(e.message).slice(0, 200) + '\n');
    }

    if (cnameExists) {
      process.stdout.write('CNAME_ALREADY_CONFIGURED\n');
      // 仍然尝试 PutCname（可能已绑定）
      try {
        oss(['bucket-cname', '--method', 'put', `oss://${BUCKET}`, domain]);
        process.stdout.write('PUT_CNAME_OK (already)\n');
      } catch (e) {
        process.stdout.write('PUT_CNAME_SKIP: ' + String(e.stdout || e.message).slice(0, 200) + '\n');
      }
      continue;
    }

    // 5b. 创建 CnameToken
    process.stdout.write('--- CreateCnameToken ---\n');
    let tokenValue = null;
    try {
      const tokenOut = oss(['bucket-cname', '--method', 'put', '--item', 'token', `oss://${BUCKET}`, domain]);
      process.stdout.write('CREATE_TOKEN_OUT:\n' + tokenOut.slice(0, 800) + '\n');
    } catch (e) {
      process.stdout.write('CREATE_TOKEN_ERR: ' + String(e.stdout || e.message).slice(0, 300) + '\n');
    }

    // 5c. 获取 CnameToken 值
    try {
      const tokenGet = oss(['bucket-cname', '--method', 'get', '--item', 'token', `oss://${BUCKET}`, domain]);
      process.stdout.write('GET_TOKEN_OUT:\n' + tokenGet.slice(0, 800) + '\n');
      // 解析 Token 值（输出格式可能是 XML 或文本）
      const match = tokenGet.match(/<Token>([^<]+)<\/Token>/);
      if (match) tokenValue = match[1];
      // 也尝试从输出中提取（ossutil 格式）
      if (!tokenValue) {
        const m2 = tokenGet.match(/Token\s*[:=]\s*(\S+)/);
        if (m2) tokenValue = m2[1];
      }
    } catch (e) {
      process.stdout.write('GET_TOKEN_ERR: ' + String(e.stdout || e.message).slice(0, 300) + '\n');
    }

    if (!tokenValue) {
      process.stdout.write('NO_TOKEN_VALUE, skip TXT verification\n');
    } else {
      process.stdout.write(`TOKEN_VALUE: ${tokenValue}\n`);
      // 5d. 添加 TXT 记录验证域名所有权
      // TXT 记录名: aliyun.<domain> 的 RR 为 aliyun
      // 先删除可能存在的旧 TXT 记录
      try {
        const oldRecs = JSON.parse(run(['alidns', 'DescribeDomainRecords', '--DomainName', domain, '--RRKeyWord', 'aliyun', '--Type', 'TXT']));
        for (const r of (oldRecs.DomainRecords.Record || [])) {
          if (r.RR === 'aliyun') {
            run(['alidns', 'DeleteDomainRecord', '--RecordId', r.RecordId]);
            process.stdout.write(`DELETED_OLD_TXT: ${r.RecordId}\n`);
          }
        }
      } catch (e) { /* ignore */ }

      try {
        const addResult = run(['alidns', 'AddDomainRecord', '--DomainName', domain, '--RR', 'aliyun', '--Type', 'TXT', '--Value', tokenValue]);
        process.stdout.write('TXT_ADDED: ' + addResult.slice(0, 200) + '\n');
      } catch (e) {
        process.stdout.write('TXT_ADD_ERR: ' + String(e.stdout || e.message).slice(0, 300) + '\n');
      }

      // 等待 DNS 生效
      process.stdout.write('Waiting 15s for DNS propagation...\n');
      await sleep(15000);
    }

    // 5e. PutCname 绑定域名
    process.stdout.write('--- PutCname ---\n');
    try {
      oss(['bucket-cname', '--method', 'put', `oss://${BUCKET}`, domain]);
      process.stdout.write('PUT_CNAME_OK\n');
    } catch (e) {
      process.stdout.write('PUT_CNAME_ERR: ' + String(e.stdout || e.message).slice(0, 400) + '\n');
    }

    // 5f. 添加 CNAME 记录指向 bucket endpoint
    const bucketTarget = `${BUCKET}.${ENDPOINT}`;
    // 先删除根域名的旧 CNAME 记录
    try {
      const recs = JSON.parse(run(['alidns', 'DescribeDomainRecords', '--DomainName', domain, '--RRKeyWord', '@', '--Type', 'CNAME']));
      for (const r of (recs.DomainRecords.Record || [])) {
        if (r.RR === '@') {
          run(['alidns', 'DeleteDomainRecord', '--RecordId', r.RecordId]);
          process.stdout.write(`DELETED_OLD_CNAME: ${r.RecordId}\n`);
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const cnameResult = run(['alidns', 'AddDomainRecord', '--DomainName', domain, '--RR', '@', '--Type', 'CNAME', '--Value', bucketTarget]);
      process.stdout.write(`CNAME_ADDED: @ -> ${bucketTarget}: ` + cnameResult.slice(0, 200) + '\n');
    } catch (e) {
      process.stdout.write('CNAME_ADD_ERR: ' + String(e.stdout || e.message).slice(0, 300) + '\n');
    }
  }

  // 6. 验证
  process.stdout.write('\n=== STEP 6: verify cname list ===\n');
  try {
    const cnameList = oss(['bucket-cname', '--method', 'get', `oss://${BUCKET}`]);
    process.stdout.write('CNAME_LIST:\n' + cnameList.slice(0, 800) + '\n');
  } catch (e) {
    process.stdout.write('CNAME_LIST_ERR: ' + String(e.stdout || e.message).slice(0, 300) + '\n');
  }

  process.stdout.write('\nDEPLOY_SALE_DONE\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
