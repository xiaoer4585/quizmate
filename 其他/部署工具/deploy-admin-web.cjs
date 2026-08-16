// CHG-20260803 部署 admin-web 到 OSS（上传更新后的 index.html 到 quizmate-vip bucket 的 admin-web/ 路径）
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

function loadAliyunAk() {
  const cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.aliyun', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const profile = cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
  return { id: profile.access_key_id, secret: profile.access_key_secret };
}

const LOCAL_FILE = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip/admin-web/index.html');
const OSS_OBJECT = 'admin-web/index.html';

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) throw new Error('admin-web/index.html not found: ' + LOCAL_FILE);
  const AK = loadAliyunAk();
  // bucket quizmate-vip 绑定了 CNAME www.quizmate.vip，必须用 cname 方式
  const client = new OSS({ endpoint: 'https://www.quizmate.vip', cname: true, bucket: 'quizmate-vip', secure: true, accessKeyId: AK.id, accessKeySecret: AK.secret, timeout: 120_000 });
  const result = await client.put(OSS_OBJECT, LOCAL_FILE, { headers: { 'Cache-Control': 'no-cache' } });
  if (result.res.status !== 200) throw new Error('OSS put failed: ' + result.res.status);
  process.stdout.write('ADMIN_WEB_UPLOAD_OK ' + OSS_OBJECT + ' ' + fs.statSync(LOCAL_FILE).size + ' bytes\n');

  // 验证下载
  const verifyRes = await client.get(OSS_OBJECT);
  process.stdout.write('VERIFY_OK status=' + verifyRes.res.status + ' bytes=' + verifyRes.content.length + '\n');
  // 检查是否包含域名询价菜单
  const content = verifyRes.content.toString('utf8');
  const hasDomainInquiries = content.includes('domainInquiries');
  process.stdout.write('HAS_DOMAIN_INQUIRIES_MENU=' + hasDomainInquiries + '\n');
}

main().catch((e) => { process.stderr.write('FAIL ' + e.message + '\n'); process.exitCode = 1; });
