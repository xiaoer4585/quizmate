const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runCommand, credentials } = require('../../../其他/部署工具/companion-remote-lib.cjs');

const archivePath = path.join(__dirname, 'companion-service.tar.gz');
const archive = fs.readFileSync(archivePath);
const archiveSha = crypto.createHash('sha256').update(archive).digest('hex');
const encoded = archive.toString('base64');
const remoteArchive = '/tmp/quizmate-companion-CHG-20260910-03.tar.gz';
const remoteEncoded = '/tmp/quizmate-companion-CHG-20260910-03.b64';
const auth = credentials();

async function upload() {
  for (let offset = 0; offset < encoded.length; offset += 8000) {
    const mode = offset ? '>>' : '>';
    await runCommand(auth, `umask 077\nprintf '%s' '${encoded.slice(offset, offset + 8000)}' ${mode} ${remoteEncoded}`);
    process.stdout.write(`UPLOADED ${Math.min(offset + 8000, encoded.length)}/${encoded.length}\n`);
  }
}

const command = `set -eu
umask 077
APP=/opt/quizmate-companion-test
STAGE=/opt/quizmate-companion-test-stage-CHG-20260910-03
BACK=/opt/quizmate-companion-test-backup-CHG-20260910-03
CONF=/etc/nginx/conf.d/api.quizmate.vip.conf
UNIT=/etc/systemd/system/quizmate-companion-test.service
test -d "$APP"
test ! -e "$STAGE"
test ! -e "$BACK"
base64 -d ${remoteEncoded} > ${remoteArchive}
echo '${archiveSha}  ${remoteArchive}' | sha256sum -c -
mkdir -m 700 "$BACK" "$STAGE"
cp -a "$APP" "$BACK/app"
cp -a "$CONF" "$BACK/nginx.conf"
cp -a "$UNIT" "$BACK/service.unit"
cp -a /var/lib/quizmate-companion-test "$BACK/private-data"
tar -xzf "${remoteArchive}" -C "$STAGE"
cd "$STAGE"
npm ci --omit=dev --no-audit --no-fund
node --test *.test.mjs
chown -R quizmate-companion:quizmate-companion "$STAGE"
chmod 750 "$STAGE"
rollback() {
  systemctl stop quizmate-companion-test || true
  if test -d "$APP"; then mv "$APP" "$BACK/failed-app"; fi
  cp -a "$BACK/app" "$APP"
  nginx -t && systemctl reload nginx
  systemctl start quizmate-companion-test
}
trap rollback ERR
systemctl stop quizmate-companion-test
mv "$APP" "$BACK/original-app"
mv "$STAGE" "$APP"
nginx -t
systemctl reload nginx
systemctl start quizmate-companion-test
sleep 3
curl -fsS --max-time 15 https://api.quizmate.vip/companion-test/health
echo
curl -fsS --max-time 15 http://127.0.0.1:8200/health
echo
systemctl stop quizmate-companion-test
mv "$APP" "$BACK/new-app"
cp -a "$BACK/app" "$APP"
systemctl start quizmate-companion-test
sleep 3
curl -fsS --max-time 10 http://127.0.0.1:8235/companion-test/health
echo ' rollback-old-service-ok'
systemctl stop quizmate-companion-test
mv "$APP" "$BACK/rollback-tested-app"
mv "$BACK/new-app" "$APP"
systemctl start quizmate-companion-test
sleep 3
curl -fsS --max-time 15 https://api.quizmate.vip/companion-test/health
echo ' protected-service-restored'
systemctl is-active quizmate-companion-test quizmate-api-shadow nginx
sha256sum "$APP/interview-engine.mjs" "$APP/interview-policy.mjs" "$APP/server.mjs"
echo "BACKUP=$BACK"
trap - ERR`;

upload().then(() => runCommand(auth, command)).then((output) => {
  fs.writeFileSync(path.join(__dirname, 'remote-deployment.txt'), output, 'utf8');
  console.log(`REMOTE_DEPLOY_OK archive_sha256=${archiveSha}`);
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
