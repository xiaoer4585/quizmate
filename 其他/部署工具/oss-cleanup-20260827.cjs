// 2026-08-27 OSS 线上归档清理脚本（quizmate-cn bucket）
// 删除范围：旧下载站、旧 manual 图、杂项遗留、3 个点名旧文件、旧安装包、旧 suite
// 保留：temp/（客户端构建测试用）、mac/ 与 mac-delivery/ 与 suite 当前版（安装包相关，等构建任务完成）、WW_verify_*、QuizMate-Mac-Manual.pdf
// 用法：node oss-cleanup-20260827.cjs [--dry]
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const DRY = process.argv.includes('--dry');
const LIST_FILE = path.resolve(__dirname, 'oss-cleanup-20260827.txt');

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
const p = cfg.profiles.find((x) => x.name === cfg.current) || cfg.profiles[0];
const client = new OSS({ region: 'oss-cn-beijing', endpoint: 'https://oss-cn-beijing.aliyuncs.com', bucket: 'quizmate-cn', secure: true, accessKeyId: p.access_key_id, accessKeySecret: p.access_key_secret, timeout: 120000 });

function isDelete(key) {
  if (key.startsWith('下载官网/')) return true; // 旧下载站整目录
  if (/^assets\/manual\/(client_screenshot|image\d+)\.png$/.test(key)) return true; // 旧版手册配图（新版 jpg 手册保留）
  if (['manual.css', 'purchase.js', 'test-write-permission.txt', 'f38a9155196916de0eac748d37d62888.txt', 'README.md', 'server.js', 'shop.html'].includes(key)) return true; // 杂项遗留 + 用户点名删除的 3 个旧版
  if (key.startsWith('downloads/build-logs/')) return true;
  if (/^downloads\/(QuizMate-Android-2026\.07\.(29|30)\.apk|QuizMate-Career-Extension-2\.0\.0\.zip|QuizMate-Mac-2025\.11\.17-x64\.zip|QuizMate-Mac-2026\.07\.24-x64\.zip|QuizMate-Mac-Apple-Silicon-2026\.8\.(20|21)\.dmg|QuizMate-Mac-Intel-2026\.8\.(20|21)\.dmg|QuizMate-Windows-1\.0\.0-x64\.exe|QuizMate-Windows-2025\.11\.17\.exe|QuizMate-Windows-2026\.0?7\.\d+\.exe|QuizMate-Windows-2026\.08\.(05|07)\.exe|学习悬浮助手-安卓版\.apk|网页学习助手-电脑版\.zip|latest\.json)$/.test(key)) return true; // 历史安装包（QuizMate-Mac-Manual.pdf 等手册保留）
  if (/^suite\/QuizMate-1\.\d\.\d/.test(key)) return true; // 旧 suite 套件（保留 QuizMate-Windows-2026.8.23 当前版）
  return false;
}

(async () => {
  let marker; const all = [];
  do {
    const res = await client.list({ 'max-keys': 1000, marker });
    for (const o of res.objects || []) all.push(o.name);
    marker = res.nextMarker;
  } while (marker);
  const toDelete = all.filter(isDelete);
  console.log(`TOTAL=${all.length} TO_DELETE=${toDelete.length} MODE=${DRY ? 'DRY' : 'EXECUTE'}`);
  fs.writeFileSync(LIST_FILE, toDelete.join('\n') + '\n', 'utf8');
  console.log(`LIST_SAVED ${LIST_FILE}`);
  if (DRY) { for (const k of toDelete) console.log('  ' + k); return; }
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const r = await client.deleteMulti(batch, { quiet: true });
    console.log(`DELETED batch ${i / 100 + 1}: ${batch.length} (deleted=${(r.deleted || []).length})`);
  }
  let marker2; let remain = 0;
  do {
    const res = await client.list({ 'max-keys': 1000, marker: marker2 });
    remain += (res.objects || []).filter((o) => isDelete(o.name)).length;
    marker2 = res.nextMarker;
  } while (marker2);
  console.log(`VERIFY_REMAINING_SHOULD_DELETE=${remain}`);
})().catch((e) => { console.error('FAIL', e.message); process.exitCode = 1; });
