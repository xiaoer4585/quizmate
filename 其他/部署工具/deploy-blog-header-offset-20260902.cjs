// CHG-20260902-02: publish the shared blog header offset to quizmate-cn.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, '官网模块/正式官网-quizmate.vip');
const KEY = 'styles.css';
const CHANGE_ID = 'CHG-20260902-02';
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function profile() {
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  return cfg.profiles.find((p) => p.name === (cfg.current || 'default')) || cfg.profiles[0];
}
async function main() {
  const localPath = path.join(SITE, KEY);
  const local = fs.readFileSync(localPath);
  if (!local.includes('.blog-page') || !local.includes('padding-top: var(--header-height)')) throw new Error('blog header offset marker missing');
  const p = profile();
  const client = new OSS({ region: 'cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: p.access_key_id, accessKeySecret: p.access_key_secret, stsToken: p.sts_token || '', timeout: 600000 });
  const backup = `rollback/${CHANGE_ID}/styles.css.before`;
  const previous = await client.get(KEY);
  await client.put(backup, previous.content, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' } });
  await client.put(KEY, localPath, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' } });
  const remote = await client.get(KEY);
  if (sha256(remote.content) !== sha256(local)) throw new Error('styles.css hash mismatch');
  for (const key of ['blog.html', 'blog/article-01_2026-秋招开启时间节点.html', 'blog/article-21_ai网申自动化插件.html']) {
    const head = await client.head(key);
    if (head.res.status !== 200) throw new Error(`${key} HTTP ${head.res.status}`);
    process.stdout.write(`VERIFY ${key} HTTP=${head.res.status}\n`);
  }
  process.stdout.write(`BACKUP=${backup}\nSTYLES_SHA256=${sha256(remote.content)}\nDEPLOY_BLOG_HEADER_OFFSET_OK\n`);
}
main().catch((error) => { process.stderr.write(`DEPLOY_FAILED ${error.stack || error.message}\n`); process.exitCode = 1; });
