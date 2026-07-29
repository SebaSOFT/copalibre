## 1. Values schema extension

- [ ] 1.1 Add `autoscaling`, `podDisruptionBudget`, `affinity`, `networkPolicy`, `ingress`, `externalSecrets` groups to `deploy/helm/copalibre/values.yaml`, all defaulted to disabled/off
- [ ] 1.2 Document each new value group's schema and default in `deploy/helm/copalibre/README.md`

## 2. Autoscaling

- [ ] 2.1 Add `templates/hpa-api.yaml` (HTTP request-rate metric)
- [ ] 2.2 Add `templates/hpa-events.yaml` (active connection-count metric)
- [ ] 2.3 Add `templates/hpa-worker.yaml` (outbox queue depth/age metric via custom-metrics adapter)
- [ ] 2.4 Document the required custom-metrics-adapter prerequisite for the `worker` HPA in `docs/deployment/enterprise-kubernetes.md`

## 3. Disruption protection and scheduling

- [ ] 3.1 Add `templates/pdb.yaml` (PodDisruptionBudget per role, gated by `podDisruptionBudget.enabled`)
- [ ] 3.2 Add pod anti-affinity rules to the Deployment template (preferred, not required, scheduling across nodes)

## 4. Network policy and ingress

- [ ] 4.1 Add `templates/networkpolicy.yaml` implementing default-deny with explicit per-role allow rules
- [ ] 4.2 Add `templates/ingress.yaml` with TLS/cert-manager annotations, layered on the existing Service templates
- [ ] 4.3 Add `templates/externalsecret.yaml` for External Secrets Operator integration

## 5. Managed dependency documentation

- [ ] 5.1 Document managed PostgreSQL connection-string wiring (no code change required) in `docs/deployment/enterprise-kubernetes.md`
- [ ] 5.2 Document managed Redis wiring (cache/lock use only, never authoritative, per the architecture doc)
- [ ] 5.3 Document managed S3-compatible object-storage wiring through the existing adapter boundary
- [ ] 5.4 Document the optional Kamal VM-bridge path in `docs/deployment/kamal.md`, asserting identical image/env contract

## 6. Measured evidence validations

- [ ] 6.1 Write `scripts/validate-multi-node-failover.sh`: provision a >=2-node cluster, run `api`/`events`/`worker` at `replicas >= 2` across nodes, forcibly terminate one node, assert continued service and pod rescheduling within the documented recovery window
- [ ] 6.2 Write `scripts/validate-backup-restore.sh`: restore the latest PostgreSQL + object-storage backup into a clean cluster, run the same integrity checks defined by `0021-deployment-docker-compose-cli`
- [ ] 6.3 Write `scripts/validate-upgrade-safety.sh`: perform a chart upgrade across two minor versions, assert zero-downtime and successful migration Job completion
- [ ] 6.4 Each validation script emits a dated evidence report (JSON or Markdown) to `docs/deployment/evidence/`

## 7. Evidence-gated documentation

- [ ] 7.1 Write `docs/deployment/enterprise-kubernetes.md`, requiring a linked, dated, passing evidence report before any readiness claim
- [ ] 7.2 Add a doc-lint script that parses `enterprise-kubernetes.md` for readiness language and fails if no valid linked evidence report exists

## 8. Unit and integration tests

- [ ] 8.1 Unit test: HPA template renders correct metric type per role when `autoscaling.<role>.enabled` is true
- [ ] 8.2 Unit test: NetworkPolicy template renders default-deny plus only the documented allow rules per role
- [ ] 8.3 Unit test: doc-lint script correctly fails on unlinked readiness claims and passes on a valid linked, dated, passing report
- [ ] 8.4 Integration test (on real multi-node K8s/K3s): node-failure-does-not-interrupt-service (task 6.1's assertions, automated)
- [ ] 8.5 Integration test: default install produces zero enterprise-only resources (HPA/PDB/NetworkPolicy/Ingress/ExternalSecret absent)

## 9. CI wiring

- [ ] 9.1 Add `helm-lint-enterprise` step to the existing `helm-lint` job (extends `.github/workflows/ci.yml` from `0026-k3s-helm-deployment`): lints the chart with all enterprise values enabled, not just defaults
- [ ] 9.2 Add the doc-lint script (task 7.2) as a required PR-blocking step in `.github/workflows/ci.yml`
- [ ] 9.3 Add a new scheduled (e.g. weekly) `k8s-enterprise-validate` workflow running scripts 6.1-6.3 and publishing their evidence reports as workflow artifacts; alert only on consecutive failures, matching `0026-k3s-helm-deployment`'s scheduled-validation rationale
