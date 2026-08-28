#!/usr/bin/env bash
set -euo pipefail

ROLE_NAME="QuizMateOssGatewayRole"
CERT_NAME="quizmate.cn"
CONTACT_EMAIL="support@quizmate.vip"
AUTH_HOOK="/usr/local/sbin/quizmate-acme-dns-auth"
CLEANUP_HOOK="/usr/local/sbin/quizmate-acme-dns-cleanup"
DEPLOY_HOOK="/usr/local/sbin/quizmate-oss-cert-deploy"

install -d -m 0700 /var/lib/quizmate-acme

cat >"$AUTH_HOOK" <<'AUTH'
#!/usr/bin/env bash
set -euo pipefail

ROLE_NAME="QuizMateOssGatewayRole"
STATE_DIR="/var/lib/quizmate-acme"

case "${CERTBOT_DOMAIN:-}" in
  quizmate.cn) rr="_acme-challenge" ;;
  www.quizmate.cn) rr="_acme-challenge.www" ;;
  *) echo "Unsupported ACME domain: ${CERTBOT_DOMAIN:-missing}" >&2; exit 1 ;;
esac

response=$(aliyun alidns AddDomainRecord \
  --mode EcsRamRole \
  --ram-role-name "$ROLE_NAME" \
  --region cn-hangzhou \
  --DomainName quizmate.cn \
  --RR "$rr" \
  --Type TXT \
  --Value "$CERTBOT_VALIDATION")

record_id=$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["RecordId"])')
printf '%s\n' "$record_id" >"$STATE_DIR/${CERTBOT_DOMAIN}.record-id"

# Let the authoritative DNS servers observe the TXT record before Certbot
# asks Let's Encrypt to validate it.
sleep 90
AUTH

cat >"$CLEANUP_HOOK" <<'CLEANUP'
#!/usr/bin/env bash
set -euo pipefail

ROLE_NAME="QuizMateOssGatewayRole"
record_file="/var/lib/quizmate-acme/${CERTBOT_DOMAIN:-unknown}.record-id"

if [[ -s "$record_file" ]]; then
  record_id=$(cat "$record_file")
  aliyun alidns DeleteDomainRecord \
    --mode EcsRamRole \
    --ram-role-name "$ROLE_NAME" \
    --region cn-hangzhou \
    --RecordId "$record_id" >/dev/null
  rm -f "$record_file"
fi
CLEANUP

cat >"$DEPLOY_HOOK" <<'DEPLOY'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROLE_NAME="QuizMateOssGatewayRole"
OSS_BUCKET="quizmate-cn"
OSS_ENDPOINT="oss-cn-beijing.aliyuncs.com"
lineage="${RENEWED_LINEAGE:-/etc/letsencrypt/live/quizmate.cn}"
fullchain="$lineage/fullchain.pem"
private_key="$lineage/privkey.pem"

[[ " ${RENEWED_DOMAINS:-quizmate.cn www.quizmate.cn} " == *" quizmate.cn "* ]] || exit 0
test -s "$fullchain"
test -s "$private_key"

openssl x509 -in "$fullchain" -noout -ext subjectAltName | grep -q 'DNS:quizmate.cn'
openssl x509 -in "$fullchain" -noout -ext subjectAltName | grep -q 'DNS:www.quizmate.cn'
openssl x509 -in "$fullchain" -checkend $((60 * 24 * 60 * 60)) -noout

cert_name="quizmate_cn_acme_$(date -u +%Y%m%d_%H%M%S)"
upload_json=$(aliyun cas UploadUserCertificate \
  --mode EcsRamRole \
  --ram-role-name "$ROLE_NAME" \
  --region cn-hangzhou \
  --Name "$cert_name" \
  --Cert "$(cat "$fullchain")" \
  --Key "$(cat "$private_key")")

cert_id=$(printf '%s' "$upload_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("CertId") or d.get("CertificateId") or "")')
test -n "$cert_id"
cert_identifier="${cert_id}-cn-hangzhou"

for domain in quizmate.cn www.quizmate.cn; do
  xml_file=$(mktemp)
  printf '%s' "<BucketCnameConfiguration><Cname><Domain>${domain}</Domain><CertificateConfiguration><CertId>${cert_identifier}</CertId><Force>true</Force></CertificateConfiguration></Cname></BucketCnameConfiguration>" >"$xml_file"
  aliyun oss bucket-cname \
    --method put \
    --item certificate \
    "oss://${OSS_BUCKET}" \
    "$xml_file" \
    --endpoint "$OSS_ENDPOINT" \
    --region cn-beijing \
    --mode EcsRamRole \
    --ecs-role-name "$ROLE_NAME" >/dev/null
  rm -f "$xml_file"
done

expected=$(openssl x509 -in "$fullchain" -noout -fingerprint -sha1 | cut -d= -f2)
for host in quizmate.cn www.quizmate.cn; do
  matched=false
  for attempt in 1 2 3 4 5 6; do
    remote=$(timeout 20 openssl s_client -connect "${host}:443" -servername "$host" </dev/null 2>/dev/null \
      | openssl x509 -noout -fingerprint -sha1 \
      | cut -d= -f2 || true)
    if [[ "$remote" == "$expected" ]]; then
      matched=true
      break
    fi
    sleep 10
  done
  [[ "$matched" == true ]] || { echo "Certificate deployment verification failed for $host" >&2; exit 1; }
done

logger -t quizmate-certbot "Deployed ${cert_identifier} to quizmate.cn and www.quizmate.cn"
DEPLOY

chmod 0750 "$AUTH_HOOK" "$CLEANUP_HOOK" "$DEPLOY_HOOK"

# Validate DNS automation against the Let's Encrypt staging environment before
# requesting a production certificate.
certbot certonly \
  --dry-run \
  --non-interactive \
  --agree-tos \
  --no-eff-email \
  --email "$CONTACT_EMAIL" \
  --manual \
  --preferred-challenges dns \
  --manual-auth-hook "$AUTH_HOOK" \
  --manual-cleanup-hook "$CLEANUP_HOOK" \
  --manual-public-ip-logging-ok \
  -d quizmate.cn \
  -d www.quizmate.cn

# Create the production renewal lineage. Certbot stores these hooks in the
# renewal configuration, and the existing twice-daily cron invokes them when
# the certificate is near expiry.
issued=false
for attempt in 1 2 3; do
  if certbot certonly \
    --non-interactive \
    --agree-tos \
    --no-eff-email \
    --email "$CONTACT_EMAIL" \
    --cert-name "$CERT_NAME" \
    --manual \
    --preferred-challenges dns \
    --manual-auth-hook "$AUTH_HOOK" \
    --manual-cleanup-hook "$CLEANUP_HOOK" \
    --deploy-hook "$DEPLOY_HOOK" \
    --manual-public-ip-logging-ok \
    -d quizmate.cn \
    -d www.quizmate.cn; then
    issued=true
    break
  fi

  if [[ "$attempt" -lt 3 ]]; then
    echo "Production ACME validation failed on attempt ${attempt}; retrying after DNS recovery delay." >&2
    sleep 120
  fi
done

[[ "$issued" == true ]]

grep -q "authenticator = manual" "/etc/letsencrypt/renewal/${CERT_NAME}.conf"
grep -q "manual_auth_hook = ${AUTH_HOOK}" "/etc/letsencrypt/renewal/${CERT_NAME}.conf"
grep -q "manual_cleanup_hook = ${CLEANUP_HOOK}" "/etc/letsencrypt/renewal/${CERT_NAME}.conf"
grep -q "renew_hook = ${DEPLOY_HOOK}" "/etc/letsencrypt/renewal/${CERT_NAME}.conf" \
  || grep -q "deploy_hook = ${DEPLOY_HOOK}" "/etc/letsencrypt/renewal/${CERT_NAME}.conf"

certbot certificates --cert-name "$CERT_NAME"
