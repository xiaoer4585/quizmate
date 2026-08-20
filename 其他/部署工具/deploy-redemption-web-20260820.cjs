// CHG-20260820-04 前端部署：兑换码功能官网页面 + 后台管理页
// quizmate-cn bucket：recharge.html / credits.js / shop.html / shop.js（官网静态站）
// quizmate-vip bucket：admin-web/index.html（后台管理页，cname www.quizmate.vip）
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const changeId = 'CHG-20260820-04-REDEMPTION';
const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');

function loadCredentials() {
  const configPath = path.join(process.env.USERPROFILE, '.aliyun', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = config.profiles.find((item) => item.name === (config.current || 'default')) || config.profiles[0];
  if (!profile) throw new Error('Current Aliyun CLI profile not found');
  return { accessKeyId: profile.access_key_id, accessKeySecret: profile.access_key_secret };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// 部署前 JS 语法校验，避免把坏脚本推到线上
function assertJsSyntax(file) {
  const code = fs.readFileSync(file, 'utf8');
  new (require('vm').Script)(code, { filename: path.basename(file) });
}

async function main() {
  const creds = loadCredentials();
  const cnClient = new OSS({
    region: 'cn-beijing',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: 'quizmate-cn',
    secure: true,
    timeout: 120000,
    ...creds,
  });
  const vipClient = new OSS({
    endpoint: 'https://www.quizmate.vip',
    cname: true,
    bucket: 'quizmate-vip',
    secure: true,
    timeout: 120000,
    ...creds,
  });

  // 本地内容校验
  const creditsJs = fs.readFileSync(path.join(siteRoot, 'credits.js'), 'utf8');
  if (!creditsJs.includes('redeemCode') || !creditsJs.includes('data-redeem-modal')) throw new Error('credits.js lacks redemption feature');
  if (!creditsJs.includes('每个账户仅可兑换一次')) throw new Error('credits.js lacks per-account redeem limit hint');
  const rechargeHtml = fs.readFileSync(path.join(siteRoot, 'recharge.html'), 'utf8');
  if (!rechargeHtml.includes('data-open-redeem')) throw new Error('recharge.html lacks redeem entry');
  const shopJs = fs.readFileSync(path.join(siteRoot, 'shop.js'), 'utf8');
  if (!shopJs.includes('createShopOrder') || !shopJs.includes('queryShopOrder')) throw new Error('shop.js lacks shop order actions');
  const adminHtml = fs.readFileSync(path.join(siteRoot, 'admin-web/index.html'), 'utf8');
  if (!adminHtml.includes('data-view-tab="redemptionCodes"') || !adminHtml.includes('adminGenerateRedemptionCodes')) throw new Error('admin page lacks redemption UI');
  assertJsSyntax(path.join(siteRoot, 'credits.js'));
  assertJsSyntax(path.join(siteRoot, 'shop.js'));

  // 官网静态站文件：先备份旧版本到 rollback/
  const siteFiles = [
    ['recharge.html', 'text/html; charset=utf-8'],
    ['credits.js', 'application/javascript; charset=utf-8'],
    ['shop.html', 'text/html; charset=utf-8'],
    ['shop.js', 'application/javascript; charset=utf-8'],
  ];
  for (const [objectName] of siteFiles) {
    const backupName = `rollback/${changeId}/${objectName}`;
    try {
      const previous = await cnClient.get(objectName);
      await cnClient.put(backupName, previous.content, { headers: { 'Content-Type': 'application/octet-stream' } });
      process.stdout.write(`BACKUP_OK ${backupName} ${previous.content.length} bytes\n`);
    } catch (e) {
      if (String(e.message).includes('NoSuchKey') || e.status === 404) {
        process.stdout.write(`BACKUP_SKIP ${objectName} (not exists, new file)\n`);
      } else {
        throw e;
      }
    }
  }

  // 上传并校验 hash
  for (const [objectName, contentType] of siteFiles) {
    const localPath = path.join(siteRoot, objectName);
    const local = fs.readFileSync(localPath);
    await cnClient.put(objectName, localPath, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
    });
    const remote = await cnClient.get(objectName);
    const localHash = sha256(local);
    if (sha256(remote.content) !== localHash) throw new Error(`Hash mismatch: ${objectName}`);
    process.stdout.write(`UPLOAD_VERIFY_OK ${objectName} ${local.length} bytes sha256=${localHash}\n`);
  }

  // 后台管理页：备份 + 上传 + 校验（quizmate-vip bucket admin-web/ 路径）
  const adminLocal = path.join(siteRoot, 'admin-web/index.html');
  const adminBackup = `rollback/${changeId}/admin-web.index.before-redemption.html`;
  const adminPrevious = await vipClient.get('admin-web/index.html');
  await vipClient.put(adminBackup, adminPrevious.content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  process.stdout.write(`BACKUP_OK ${adminBackup} ${adminPrevious.content.length} bytes\n`);
  await vipClient.put('admin-web/index.html', adminLocal, { headers: { 'Cache-Control': 'no-cache' } });
  const adminVerify = await vipClient.get('admin-web/index.html');
  if (sha256(adminVerify.content) !== sha256(fs.readFileSync(adminLocal))) throw new Error('admin page hash mismatch');
  if (!adminVerify.content.toString('utf8').includes('data-view-tab="redemptionCodes"')) throw new Error('uploaded admin page missing redemption menu');
  process.stdout.write(`UPLOAD_VERIFY_OK admin-web/index.html ${adminVerify.content.length} bytes\n`);
  process.stdout.write('WEB_DEPLOY_ALL_DONE\n');
}

main().catch((error) => {
  process.stderr.write(`DEPLOY_FAIL ${error.code || ''} ${error.message}\n`);
  process.exitCode = 1;
});
