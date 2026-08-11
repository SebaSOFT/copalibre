#!/usr/bin/env bash
set -euo pipefail

# Produces measured evidence for the "Measured backup and restore evidence"
# requirement (0035-kubernetes-enterprise-deployment): a PostgreSQL and
# object-storage backup restores into a clean Kubernetes installation and
# passes the same integrity checks
# 0030-deployment-docker-compose-cli's Compose-level backup/restore
# requirement uses (packages/persistence/src/test-support/backup-drill.js
# seed/snapshot, the same script .github/workflows/backup-restore-drill.yml
# runs). PostgreSQL backup/restore uses the same pg_dump/pg_restore
# `./copalibre backup`/`restore` shell out to; object-storage backup/restore
# uses the MinIO client (mc) directly against the bucket — this repo has no
# object-storage backup CLI of its own yet (that's 0041's job), and none is
# needed here: mirroring a bucket with standard S3 tooling is deployment
# tooling, not new application code, matching design.md's non-goals.
# Always tears the cluster down on exit — this is a validation environment,
# never a production target.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME=copalibre-backup-restore
RELEASE_NAME=copalibre-backup-restore
IMAGE_TAG=backup-restore-$(date +%s)
EVIDENCE_DIR="${ROOT_DIR}/docs/deployment/evidence"
EVIDENCE_FILE="${EVIDENCE_DIR}/backup-restore-$(date -u +%Y%m%dT%H%M%SZ).md"
PG_DUMP_FILE=/tmp/copalibre-backup-restore.dump
OBJECT_BACKUP_DIR=/tmp/copalibre-backup-restore-objects
TEST_OBJECT_KEY=backup-drill/evidence.txt

cleanup() {
  echo "==> Tearing down cluster ${CLUSTER_NAME}"
  jobs -p | xargs -r kill >/dev/null 2>&1 || true
  k3d cluster delete "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${OBJECT_BACKUP_DIR}"
}
trap cleanup EXIT

log() { echo "==> $*"; }
fail() {
  echo "FAIL: $*" >&2
  mkdir -p "${EVIDENCE_DIR}"
  {
    echo "# Backup/restore validation — FAILED"
    echo
    echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Result: FAIL — $*"
  } >"${EVIDENCE_FILE}"
  exit 1
}

build_images() {
  log "Building copalibre:${IMAGE_TAG} and copalibre-web:${IMAGE_TAG}"
  docker build --target runtime -t "copalibre:${IMAGE_TAG}" "${ROOT_DIR}" >/dev/null
  docker build --target web -t "copalibre-web:${IMAGE_TAG}" "${ROOT_DIR}" >/dev/null
}

create_cluster() {
  log "Creating k3d cluster ${CLUSTER_NAME}"
  k3d cluster delete "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  k3d cluster create "${CLUSTER_NAME}" --wait --timeout 120s
  # helm install --wait (below) waits for every Deployment including web's —
  # without importing its image too, the web pod hangs Pending/ImagePullBackOff
  # until the install times out (confirmed empirically: this is exactly what
  # happened before this image was added here).
  k3d image import "copalibre:${IMAGE_TAG}" "copalibre-web:${IMAGE_TAG}" -c "${CLUSTER_NAME}"
}

deploy_postgres() {
  log "Deploying PostgreSQL"
  kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: postgres
          image: postgres:17
          env:
            - { name: POSTGRES_USER, value: copalibre }
            - { name: POSTGRES_PASSWORD, value: copalibre_backup_restore_only }
            - { name: POSTGRES_DB, value: copalibre }
          ports:
            - containerPort: 5432
          readinessProbe:
            exec:
              command: ['pg_isready', '-U', 'copalibre', '-d', 'copalibre']
            periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector: { app: postgres }
  ports:
    - port: 5432
EOF
  kubectl wait --for=condition=available --timeout=120s deployment/postgres
}

deploy_object_storage() {
  log "Deploying MinIO (object storage)"
  kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: object-storage
spec:
  replicas: 1
  selector:
    matchLabels: { app: object-storage }
  template:
    metadata:
      labels: { app: object-storage }
    spec:
      containers:
        - name: object-storage
          image: minio/minio:RELEASE.2025-09-07T16-13-09Z
          args: ['server', '/data', '--console-address', ':9001']
          env:
            - { name: MINIO_ROOT_USER, value: copalibre_backup_restore }
            - { name: MINIO_ROOT_PASSWORD, value: copalibre_backup_restore_only }
          ports:
            - containerPort: 9000
            - containerPort: 9001
          readinessProbe:
            httpGet: { path: /minio/health/ready, port: 9000 }
            periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata:
  name: object-storage
spec:
  selector: { app: object-storage }
  ports:
    - name: api
      port: 9000
    - name: console
      port: 9001
EOF
  kubectl wait --for=condition=available --timeout=120s deployment/object-storage
}

helm_values_file() {
  cat >/tmp/copalibre-backup-restore-values.yaml <<EOF
image:
  repository: copalibre
  tag: ${IMAGE_TAG}
web:
  image:
    repository: copalibre-web
    tag: ${IMAGE_TAG}
  env:
    COPALIBRE_JWT_ISSUER: http://oidc.invalid
    COPALIBRE_OIDC_CLIENT_ID: copalibre-backup-restore
env:
  DATABASE_URL: postgres://copalibre:copalibre_backup_restore_only@postgres:5432/copalibre
  COPALIBRE_APP_URL: http://web
  COPALIBRE_API_URL: http://${RELEASE_NAME}-api:3001
  COPALIBRE_BOOTSTRAP_TOKEN: copalibre_backup_restore_bootstrap_only
  COPALIBRE_JWKS_URI: http://oidc.invalid/jwks.json
  COPALIBRE_JWT_ISSUER: http://oidc.invalid
  COPALIBRE_JWT_AUDIENCE: copalibre
  COPALIBRE_OIDC_CLIENT_ID: copalibre-backup-restore
  COPALIBRE_EMAIL_PROVIDER: smtp
  COPALIBRE_EMAIL_FROM: backup-restore@copalibre.invalid
  COPALIBRE_SMTP_URL: smtp://smtp.invalid:25
  COPALIBRE_OBJECT_STORAGE_URL: http://object-storage:9000
  COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: copalibre_backup_restore
  COPALIBRE_OBJECT_STORAGE_SECRET_KEY: copalibre_backup_restore_only
  COPALIBRE_OBJECT_STORAGE_BUCKET: copalibre
EOF
}

install_chart() {
  log "Installing the chart (migration runs as a pre-install hook)"
  helm_values_file
  helm install "${RELEASE_NAME}" "${ROOT_DIR}/deploy/helm/copalibre" \
    --values /tmp/copalibre-backup-restore-values.yaml --wait --timeout 5m
}

configure_mc() {
  mc alias set copalibre-backup-restore http://127.0.0.1:9000 copalibre_backup_restore copalibre_backup_restore_only >/dev/null
}

main() {
  build_images
  create_cluster
  deploy_postgres
  deploy_object_storage
  install_chart

  log "6.2 seeding authoritative source data"
  local worker_pod
  worker_pod=$(kubectl get pods -l app.kubernetes.io/component=worker -o jsonpath='{.items[0].metadata.name}')
  kubectl exec "${worker_pod}" -- node packages/persistence/dist/test-support/backup-drill.js seed
  kubectl exec "${worker_pod}" -- node packages/persistence/dist/test-support/backup-drill.js snapshot >/tmp/copalibre-backup-restore-source.json

  log "Writing a known test object into object storage"
  kubectl port-forward svc/object-storage 9000:9000 >/tmp/copalibre-backup-restore-portforward.log 2>&1 &
  local pf_pid=$!
  sleep 3
  configure_mc
  mc mb "copalibre-backup-restore/copalibre" >/dev/null 2>&1 || true
  echo "backup-restore-drill-$(date -u +%s)" >/tmp/copalibre-backup-restore-object.txt
  mc cp /tmp/copalibre-backup-restore-object.txt "copalibre-backup-restore/copalibre/${TEST_OBJECT_KEY}" >/dev/null
  local source_checksum
  source_checksum=$(shasum -a 256 /tmp/copalibre-backup-restore-object.txt | awk '{print $1}')

  log "Backing up PostgreSQL (pg_dump) and object storage (mc mirror)"
  kubectl port-forward svc/postgres 5432:5432 >/tmp/copalibre-backup-restore-pg-portforward.log 2>&1 &
  local pg_pf_pid=$!
  sleep 3
  PGPASSWORD=copalibre_backup_restore_only pg_dump --host=127.0.0.1 --port=5432 --username=copalibre \
    --format=custom --file="${PG_DUMP_FILE}" copalibre
  rm -rf "${OBJECT_BACKUP_DIR}"
  mc mirror "copalibre-backup-restore/copalibre" "${OBJECT_BACKUP_DIR}" >/dev/null
  kill "${pg_pf_pid}" "${pf_pid}" >/dev/null 2>&1 || true
  wait "${pg_pf_pid}" "${pf_pid}" 2>/dev/null || true

  log "Wiping to a clean installation: deleting and recreating PostgreSQL and object storage"
  kubectl delete deployment postgres object-storage >/dev/null
  deploy_postgres
  deploy_object_storage

  log "Restoring PostgreSQL (pg_restore) and object storage (mc mirror) into the clean installation"
  kubectl port-forward svc/postgres 5432:5432 >/tmp/copalibre-backup-restore-pg-portforward-2.log 2>&1 &
  pg_pf_pid=$!
  sleep 3
  PGPASSWORD=copalibre_backup_restore_only pg_restore --host=127.0.0.1 --port=5432 --username=copalibre \
    --clean --if-exists --no-owner --dbname=copalibre "${PG_DUMP_FILE}"
  kill "${pg_pf_pid}" >/dev/null 2>&1 || true
  wait "${pg_pf_pid}" 2>/dev/null || true

  kubectl port-forward svc/object-storage 9000:9000 >/tmp/copalibre-backup-restore-portforward-2.log 2>&1 &
  pf_pid=$!
  sleep 3
  configure_mc
  mc mb "copalibre-backup-restore/copalibre" >/dev/null 2>&1 || true
  mc mirror "${OBJECT_BACKUP_DIR}" "copalibre-backup-restore/copalibre" >/dev/null
  local restored_checksum
  mc cp "copalibre-backup-restore/copalibre/${TEST_OBJECT_KEY}" /tmp/copalibre-backup-restore-object-restored.txt >/dev/null
  restored_checksum=$(shasum -a 256 /tmp/copalibre-backup-restore-object-restored.txt | awk '{print $1}')
  kill "${pf_pid}" >/dev/null 2>&1 || true
  wait "${pf_pid}" 2>/dev/null || true

  log "Verifying restored data against the same integrity checks used at the Compose level (0030)"
  worker_pod=$(kubectl get pods -l app.kubernetes.io/component=worker -o jsonpath='{.items[0].metadata.name}')
  kubectl exec "${worker_pod}" -- node packages/persistence/dist/test-support/backup-drill.js snapshot >/tmp/copalibre-backup-restore-restored.json

  local diff_output pg_ok=0 object_ok=0
  diff_output=$(diff --unified /tmp/copalibre-backup-restore-source.json /tmp/copalibre-backup-restore-restored.json || true)
  [ -z "${diff_output}" ] && pg_ok=1
  [ "${source_checksum}" = "${restored_checksum}" ] && object_ok=1

  mkdir -p "${EVIDENCE_DIR}"
  {
    echo "# Backup/restore validation"
    echo
    echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- PostgreSQL integrity check (packages/persistence's backup-drill snapshot, same as 0030's Compose-level check): $([ "${pg_ok}" -eq 1 ] && echo PASS || echo FAIL)"
    echo "- Object-storage integrity check (SHA-256 of a known test object before/after): $([ "${object_ok}" -eq 1 ] && echo PASS || echo FAIL)"
    if [ "${pg_ok}" -eq 1 ] && [ "${object_ok}" -eq 1 ]; then
      echo "- Result: PASS — the latest PostgreSQL and object-storage backup restored into a clean Kubernetes installation and passed integrity checks"
    else
      echo "- Result: FAIL"
      if [ "${pg_ok}" -ne 1 ]; then
        echo
        echo "## PostgreSQL diff"
        echo '```diff'
        echo "${diff_output}"
        echo '```'
      fi
    fi
  } >"${EVIDENCE_FILE}"
  log "Evidence report written to ${EVIDENCE_FILE}"

  [ "${pg_ok}" -eq 1 ] || fail "restored PostgreSQL data diverged from the source snapshot: ${diff_output}"
  [ "${object_ok}" -eq 1 ] || fail "restored object checksum ${restored_checksum} did not match source checksum ${source_checksum}"
  log "OK: PostgreSQL and object-storage backup/restore both passed integrity checks"
}

main "$@"
