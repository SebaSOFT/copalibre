#!/usr/bin/env bash
set -euo pipefail

# Produces measured evidence that a chart upgrade across two minor versions
# is zero-downtime and completes its migration Job successfully
# (0035-kubernetes-enterprise-deployment task 6.3).
#
# This repo's Helm chart (deploy/helm/copalibre) has never been packaged or
# published to a registry, so there is no real "previous minor version" to
# upgrade from — Chart.yaml sits at its first version (0.1.0). Rather than
# silently downscope this to "just upgrade the image tag" (which wouldn't
# exercise Helm's own chart-version-tracked upgrade path at all), this
# script makes two temporary copies of the chart with Chart.yaml's version
# bumped by one minor each (0.1.0 -> 0.2.0 -> 0.3.0) and performs two real
# `helm upgrade`s across those chart versions, in sequence, each also
# advancing the image tag the way a real release would. This is the
# smallest change that makes "chart upgrade across two minor versions" a
# true statement about what ran, not an approximation of it.
#
# Always tears the cluster down on exit — this is a validation environment,
# never a production target.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME=copalibre-upgrade-safety
RELEASE_NAME=copalibre-upgrade-safety
BASE_TAG=upgrade-safety-$(date +%s)
EVIDENCE_DIR="${ROOT_DIR}/docs/deployment/evidence"
EVIDENCE_FILE="${EVIDENCE_DIR}/upgrade-safety-$(date -u +%Y%m%dT%H%M%SZ).md"
CHART_WORKDIR=/tmp/copalibre-upgrade-safety-chart

cleanup() {
  echo "==> Tearing down cluster ${CLUSTER_NAME}"
  jobs -p | xargs -r kill >/dev/null 2>&1 || true
  k3d cluster delete "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${CHART_WORKDIR}"
}
trap cleanup EXIT

log() { echo "==> $*"; }
fail() {
  echo "FAIL: $*" >&2
  mkdir -p "${EVIDENCE_DIR}"
  {
    echo "# Upgrade safety validation — FAILED"
    echo
    echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Result: FAIL — $*"
  } >"${EVIDENCE_FILE}"
  exit 1
}

# Copies the chart to $CHART_WORKDIR/v<n> with Chart.yaml's version bumped
# by $1 minor releases from the on-disk 0.1.0 baseline.
chart_copy_at_minor_bump() {
  local bump="$1"
  local dest="${CHART_WORKDIR}/v${bump}"
  # `cp -R` needs its destination's PARENT to already exist — it does not
  # create it — so CHART_WORKDIR must be created before the first copy.
  mkdir -p "${CHART_WORKDIR}"
  rm -rf "${dest}"
  cp -R "${ROOT_DIR}/deploy/helm/copalibre" "${dest}"
  local new_version="0.$((1 + bump)).0"
  sed -i.bak "s/^version: .*/version: ${new_version}/" "${dest}/Chart.yaml"
  rm -f "${dest}/Chart.yaml.bak"
  echo "${dest}"
}

build_images() {
  local tag="$1"
  log "Building copalibre:${tag} and copalibre-web:${tag}"
  docker build --target runtime -t "copalibre:${tag}" "${ROOT_DIR}" >/dev/null
  docker build --target web -t "copalibre-web:${tag}" "${ROOT_DIR}" >/dev/null
  k3d image import "copalibre:${tag}" "copalibre-web:${tag}" -c "${CLUSTER_NAME}"
}

create_cluster() {
  log "Creating k3d cluster ${CLUSTER_NAME}"
  k3d cluster delete "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  k3d cluster create "${CLUSTER_NAME}" --wait --timeout 120s
}

deploy_postgres() {
  log "Deploying a throwaway PostgreSQL for this validation run"
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
            - { name: POSTGRES_PASSWORD, value: copalibre_upgrade_safety_only }
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

helm_values_file() {
  local tag="$1"
  cat >/tmp/copalibre-upgrade-safety-values.yaml <<EOF
image:
  repository: copalibre
  tag: ${tag}
web:
  image:
    repository: copalibre-web
    tag: ${tag}
  env:
    COPALIBRE_JWT_ISSUER: http://oidc.invalid
    COPALIBRE_OIDC_CLIENT_ID: copalibre-upgrade-safety
env:
  DATABASE_URL: postgres://copalibre:copalibre_upgrade_safety_only@postgres:5432/copalibre
  COPALIBRE_APP_URL: http://web
  COPALIBRE_API_URL: http://${RELEASE_NAME}-api:3001
  COPALIBRE_BOOTSTRAP_TOKEN: copalibre_upgrade_safety_bootstrap_only
  COPALIBRE_JWKS_URI: http://oidc.invalid/jwks.json
  COPALIBRE_JWT_ISSUER: http://oidc.invalid
  COPALIBRE_JWT_AUDIENCE: copalibre
  COPALIBRE_OIDC_CLIENT_ID: copalibre-upgrade-safety
  COPALIBRE_EMAIL_PROVIDER: smtp
  COPALIBRE_EMAIL_FROM: upgrade-safety@copalibre.invalid
  COPALIBRE_SMTP_URL: smtp://smtp.invalid:25
EOF
}

# Runs one `helm upgrade` (or `helm install` for the first step) to
# $chart_dir/$tag while an in-cluster poller hits the api Service, then
# asserts zero dropped polls and a successfully completed migrate Job for
# this revision.
upgrade_step() {
  local step_name="$1" chart_dir="$2" tag="$3" is_install="$4"
  log "${step_name}: deploying chart version $(grep '^version:' "${chart_dir}/Chart.yaml" | awk '{print $2}'), image tag ${tag}"
  helm_values_file "${tag}"

  if [ "${is_install}" = "true" ]; then
    helm install "${RELEASE_NAME}" "${chart_dir}" --values /tmp/copalibre-upgrade-safety-values.yaml --wait --timeout 5m
    kubectl wait --for=condition=available --timeout=180s "deployment/${RELEASE_NAME}-api"
    return 0
  fi

  kubectl run "copalibre-upgrade-safety-poller-${tag}" --image=curlimages/curl:latest --restart=Never \
    --command -- sh -c "while true; do curl -sf -o /dev/null http://${RELEASE_NAME}-api:3001/health || echo fail; sleep 0.5; done"
  kubectl wait --for=condition=ready --timeout=60s "pod/copalibre-upgrade-safety-poller-${tag}"

  helm upgrade "${RELEASE_NAME}" "${chart_dir}" --values /tmp/copalibre-upgrade-safety-values.yaml --wait --timeout 5m

  local failures
  failures=$(kubectl logs "copalibre-upgrade-safety-poller-${tag}" | grep -c fail || true)
  kubectl delete pod "copalibre-upgrade-safety-poller-${tag}" --grace-period=0 --force >/dev/null 2>&1 || true

  local migrate_job completion_time
  migrate_job=$(kubectl get jobs -l app.kubernetes.io/component=migrate --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
  completion_time=$(kubectl get job "${migrate_job}" -o jsonpath='{.status.completionTime}')

  [ "${failures}" -eq 0 ] || fail "${step_name}: upgrade dropped ${failures} health poll(s)"
  [ -n "${completion_time}" ] || fail "${step_name}: migrate Job ${migrate_job} did not complete"
  log "OK: ${step_name} was zero-downtime and migrate Job ${migrate_job} completed at ${completion_time}"
  echo "${failures} ${completion_time}"
}

main() {
  create_cluster
  deploy_postgres

  local v0 v1 v2 tag0 tag1 tag2
  # `|| fail` here, not bare `set -e`: bash does not propagate errexit out of
  # a command substitution by default (confirmed empirically — a failing
  # `cp` inside chart_copy_at_minor_bump did not stop this script until
  # `mkdir -p "${CHART_WORKDIR}"` fixed the underlying failure), so each
  # call is guarded explicitly rather than trusted to abort on its own.
  v0="$(chart_copy_at_minor_bump 0)" || fail "chart copy at minor bump 0 failed"
  v1="$(chart_copy_at_minor_bump 1)" || fail "chart copy at minor bump 1 failed"
  v2="$(chart_copy_at_minor_bump 2)" || fail "chart copy at minor bump 2 failed"
  tag0="${BASE_TAG}-v0"
  tag1="${BASE_TAG}-v1"
  tag2="${BASE_TAG}-v2"

  build_images "${tag0}"
  upgrade_step "6.3 install (baseline, chart 0.1.0)" "${v0}" "${tag0}" true

  build_images "${tag1}"
  local step1_result
  step1_result="$(upgrade_step "6.3 upgrade 1 of 2 (chart 0.1.0 -> 0.2.0)" "${v1}" "${tag1}" false | tail -1)"

  build_images "${tag2}"
  local step2_result
  step2_result="$(upgrade_step "6.3 upgrade 2 of 2 (chart 0.2.0 -> 0.3.0)" "${v2}" "${tag2}" false | tail -1)"

  mkdir -p "${EVIDENCE_DIR}"
  {
    echo "# Upgrade safety validation"
    echo
    echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Interpretation note: this chart has no published version history, so \"two minor versions\" is produced by bumping Chart.yaml's version by one minor per step (0.1.0 -> 0.2.0 -> 0.3.0) on temporary chart copies, each paired with a new image tag as a real release would be."
    echo "- Upgrade 1 (0.1.0 -> 0.2.0): dropped polls = $(echo "${step1_result}" | awk '{print $1}'), migrate completed at $(echo "${step1_result}" | awk '{print $2}')"
    echo "- Upgrade 2 (0.2.0 -> 0.3.0): dropped polls = $(echo "${step2_result}" | awk '{print $1}'), migrate completed at $(echo "${step2_result}" | awk '{print $2}')"
    echo "- Result: PASS — both upgrades were zero-downtime and both migrate Jobs completed successfully"
  } >"${EVIDENCE_FILE}"
  log "Evidence report written to ${EVIDENCE_FILE}"
  log "OK: chart upgrade across two minor versions was zero-downtime with successful migration Job completion at each step"
}

main "$@"
