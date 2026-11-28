#!/usr/bin/env bash
# Upgrades a real installation of a published release to the candidate and checks that nothing was
# lost: the installation is created by that release's own CLI from its published images, holds an
# organization and its administrator, and is then upgraded by this checkout's CLI.
#
#   scripts/validate-upgrade-from-release.sh <from-version> <candidate-version>
#
# The candidate images must already be on the host as ghcr.io/sebasoft/copalibre:<candidate> and
# ghcr.io/sebasoft/copalibre-web:<candidate>; `copalibre upgrade` pulls only what is missing. The
# checkout's CLI must be built (apps/copalibre/dist). Needs docker, gh (authenticated, to download
# the old CLI), curl and python3. Removes everything it created, volumes included, on exit.
set -euo pipefail

FROM_VERSION=${1:?usage: validate-upgrade-from-release.sh <from-version> <candidate-version>}
CANDIDATE=${2:?usage: validate-upgrade-from-release.sh <from-version> <candidate-version>}
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="node ${ROOT_DIR}/apps/copalibre/dist/main.js"
WORK=$(mktemp -d)
PROJECT="copalibre-upgrade-${FROM_VERSION//./-}"
PORT=${COPALIBRE_UPGRADE_TEST_PORT:-8090}
PASSWORD='Upgrade-Check-2026!'
EMAIL="admin@upgrade-${FROM_VERSION//./-}.invalid"
ALIAS="upgrade-${FROM_VERSION//./-}"

cleanup() {
  if [ -d "${WORK}/install" ]; then
    (cd "${WORK}/install" && docker compose down --volumes --remove-orphans >/dev/null 2>&1) || true
  fi
  docker volume ls --quiet --filter "name=^${PROJECT}_" | xargs -r docker volume rm >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

say() { printf '==> %s\n' "$*"; }
fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

say "Installing ${FROM_VERSION} with its own CLI"
gh release download "v${FROM_VERSION}" --repo SebaSOFT/copalibre --pattern copalibre-linux-x86_64 --dir "${WORK}/bin"
OLD_CLI="${WORK}/bin/copalibre-linux-x86_64"
chmod +x "${OLD_CLI}"
mkdir -p "${WORK}/install"
cd "${WORK}/install"

secret() { openssl rand -hex 24; }
set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

case "${FROM_VERSION}" in
  1.0.*)
    # 1.0.x writes a minimal .env and leaves every secret and the identity settings to the operator.
    "${OLD_CLI}" init </dev/null >/dev/null
    set_env COPALIBRE_IMAGE "ghcr.io/sebasoft/copalibre:${FROM_VERSION}"
    set_env COPALIBRE_WEB_IMAGE "ghcr.io/sebasoft/copalibre-web:${FROM_VERSION}"
    set_env COPALIBRE_JWKS_URI http://api:3001/.well-known/jwks.json
    set_env COPALIBRE_JWT_ISSUER "http://localhost:${PORT}"
    set_env COPALIBRE_JWT_AUDIENCE copalibre
    set_env COPALIBRE_OIDC_CLIENT_ID copalibre-local
    set_env COPALIBRE_EMAIL_PROVIDER smtp
    set_env COPALIBRE_EMAIL_FROM "torneos@${ALIAS}.invalid"
    set_env COPALIBRE_SMTP_URL smtp://host.docker.internal:1025
    set_env COPALIBRE_APP_URL "http://localhost:${PORT}"
    ;;
  *)
    "${OLD_CLI}" init --non-interactive --skip-preflight --app-url "http://localhost:${PORT}" </dev/null >/dev/null
    ;;
esac
set_env POSTGRES_PASSWORD "$(secret)"
set_env COPALIBRE_BOOTSTRAP_TOKEN "$(secret)"
set_env COPALIBRE_PORT "${PORT}"
set_env COMPOSE_PROJECT_NAME "${PROJECT}"
docker compose up --detach --wait >/dev/null

say "Creating an organization and its administrator on ${FROM_VERSION}"
SETUP=$(docker compose exec -T -e COPALIBRE_API_URL=http://127.0.0.1:3001 api \
  node /app/apps/copalibre/dist/main.js create-admin \
  --organization-alias "${ALIAS}" --organization-name "Upgrade ${FROM_VERSION}" --email "${EMAIL}")
TOKEN=$(printf '%s' "${SETUP}" | grep -o 'token=[A-Za-z0-9_-]*' | head -n 1 | cut -d= -f2)
[ -n "${TOKEN}" ] || fail "create-admin printed no setup link"

accept() {
  curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' \
    -H "origin: http://localhost:${PORT}" \
    -d "{\"token\":\"${TOKEN}\",\"password\":\"${PASSWORD}\"}" "http://localhost:${PORT}$1"
}
ACCEPTED_BEFORE=false
case "${FROM_VERSION}" in
  # These releases sign in natively behind their gateway; 1.0.x only through an external provider.
  1.1.* | 1.2.* | 2.*)
    [ "$(accept /auth/accept-invitation)" = 200 ] || fail "the invitation could not be accepted on ${FROM_VERSION}"
    ACCEPTED_BEFORE=true
    ;;
esac

identity_rows() {
  docker compose exec -T postgres psql -U copalibre -d copalibre -At -c \
    "select (select count(*) from organizations) || ' ' || (select count(*) from organization_invites) || ' ' || (select count(*) from identity_principals)"
}
BEFORE=$(identity_rows)
say "Before: organizations, invitations, principals = ${BEFORE}"

say "Upgrading to ${CANDIDATE} with this checkout's CLI"
${CLI} upgrade --target-version "${CANDIDATE}" --yes --skip-self-update --skip-modules </dev/null

say 'Checking the upgraded installation'
[ "$(docker compose exec -T postgres psql -U copalibre -d copalibre -Atc 'show server_version_num' | cut -c1-2)" = 18 ] ||
  fail 'PostgreSQL is not 18'
AFTER=$(identity_rows)
[ "${BEFORE}" = "${AFTER}" ] || fail "rows changed: ${BEFORE} before, ${AFTER} after"
if docker volume inspect "${PROJECT}_postgres-data" >/dev/null 2>&1; then
  fail 'the PostgreSQL 17 volume is still there'
fi
for service in $(docker compose ps --services); do
  image=$(docker compose ps --format '{{.Image}}' "${service}")
  case "${image}" in
    ghcr.io/sebasoft/copalibre*:"${CANDIDATE}" | postgres:* | caddy:*) ;;
    *) fail "${service} runs ${image}, not the candidate" ;;
  esac
done
if [ "${ACCEPTED_BEFORE}" = false ]; then
  [ "$(accept /api/auth/accept-invitation)" = 200 ] || fail 'the invitation could not be accepted after the upgrade'
fi
JAR="${WORK}/cookies"
LOGIN=$(curl -s -c "${JAR}" -o /dev/null -w '%{http_code}' -H 'content-type: application/json' \
  -H "origin: http://localhost:${PORT}" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" "http://localhost:${PORT}/api/auth/login")
[ "${LOGIN}" = 200 ] || fail "sign-in answered ${LOGIN}"
MINE=$(curl -s -b "${JAR}" -H "origin: http://localhost:${PORT}" "http://localhost:${PORT}/api/organizations?mine=true")
printf '%s' "${MINE}" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
assert any(r['organizationAlias'] == '${ALIAS}' and r['role'] == 'admin' for r in rows), rows
" || fail "the administrator does not see ${ALIAS} as admin: ${MINE}"
say "PASS: ${FROM_VERSION} -> ${CANDIDATE}: rows ${AFTER}, PostgreSQL 18, 17 removed, administrator signs in"
