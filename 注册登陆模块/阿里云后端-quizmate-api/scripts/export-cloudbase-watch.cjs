const fs = require("node:fs/promises");
const path = require("node:path");
const cloudbase = require("@cloudbase/node-sdk");

const COLLECTIONS = [
  "watch_packages",
  "watch_sources",
  "watch_subscriptions",
  "watch_user_intents",
  "watch_jobs",
  "watch_source_snapshots",
  "watch_source_changes",
  "watch_site_sessions",
  "watch_applications",
  "watch_application_events"
];

async function readCollection(db, name) {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const page = await db.collection(name).skip(offset).limit(100).get();
    const rows = Array.isArray(page.data) ? page.data : [];
    result.push(...rows);
    if (rows.length < 100) break;
  }
  return result;
}

async function main() {
  const output = path.resolve(process.argv[2] || "cloudbase-watch-export.json");
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.TENCENTCLOUD_SECRETID,
    secretKey: process.env.TENCENTCLOUD_SECRETKEY,
    sessionToken: process.env.TENCENTCLOUD_SESSIONTOKEN
  });
  const db = app.database();
  const collections = {};
  for (const name of COLLECTIONS) collections[name] = await readCollection(db, name);
  const payload = {
    format: "quizmate-cloudbase-watch-export-v1",
    envId: process.env.CLOUDBASE_ENV_ID,
    exportedAt: new Date().toISOString(),
    collections
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.length]))));
}

main().catch((error) => {
  process.stderr.write(`export failed: ${error?.message || error}\n`);
  process.exitCode = 1;
});
