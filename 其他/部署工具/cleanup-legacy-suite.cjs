// QuizMate 清理 quizmate-vip bucket 上的旧 suite 资源
// 背景：第一轮把 suite 推到了 quizmate-vip（绑定 update.quizmate.vip），
// 但 publish.url 已切到 https://quizmate.cn/suite/，那个 bucket 上的旧 yml/exe 必须清掉，
// 否则任何还指向 update.quizmate.vip 的旧 exe 都会拉到旧版本。
//
// 用法：
//   node 其他/部署工具/cleanup-legacy-suite.cjs
//   QUIZMATE_DRY_RUN=1 node 其他/部署工具/cleanup-legacy-suite.cjs  # 只列不删
const fs = require('fs');
const path = require('path');
const OSS = require('../../注册登陆模块/阿里云统一入口-study-auth-api/node_modules/ali-oss');

const DRY_RUN = process.env.QUIZMATE_DRY_RUN === '1';
const BUCKET = 'quizmate-vip';

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.aliyun', 'config.json'), 'utf8'));
  const item = config.profiles.find((p) => p.name === config.current) || config.profiles[0];
  if (!item?.access_key_id || !item?.access_key_secret) throw new Error('Aliyun profile is incomplete');
  const c = new OSS({
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    bucket: BUCKET,
    secure: true,
    accessKeyId: item.access_key_id,
    accessKeySecret: item.access_key_secret,
    stsToken: item.sts_token || undefined,
    timeout: 600_000,
  });

  // 1) 列 suite/ 下的所有对象，保留作为证据
  let listed = [];
  let nextMarker = null;
  do {
    const res = await c.list({ prefix: 'suite/', 'max-keys': 1000, marker: nextMarker }, {});
    listed = listed.concat((res.objects || []).map((o) => o.name));
    nextMarker = res.nextMarker;
  } while (nextMarker);
  console.log(`SCAN ${BUCKET} suite/ total=${listed.length}`);
  for (const name of listed) console.log(`  ${name}`);

  // 2) 备份到 rollback/<timestamp>/suite/<object>
  const stamp = `CHG-CLEANUP-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
  for (const object of listed) {
    const rollback = `rollback/${stamp}/${object}`;
    if (DRY_RUN) {
      console.log(`DRY_RUN backup ${object} -> ${rollback}`);
      continue;
    }
    try {
      await c.copy(rollback, object, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`BACKUP_OK ${object} -> ${rollback}`);
    } catch (error) {
      console.log(`BACKUP_SKIP ${object} ${error.code || error.message}`);
    }
  }

  // 3) 删除 suite/ 下所有对象
  for (const object of listed) {
    if (DRY_RUN) {
      console.log(`DRY_RUN delete ${object}`);
      continue;
    }
    try {
      await c.delete(object);
      console.log(`DELETE_OK ${object}`);
    } catch (error) {
      console.log(`DELETE_FAIL ${object} ${error.code || error.message}`);
    }
  }
  console.log(`CLEANUP_DONE bucket=${BUCKET} dryRun=${DRY_RUN}`);
}

main().catch((error) => {
  console.error(`CLEANUP_FAILED ${error.name || ''} ${error.code || ''} ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});
