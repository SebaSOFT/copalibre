## 1. Chart scaffolding

- [ ] 1.1 Create `deploy/helm/copalibre/Chart.yaml` (name, version, appVersion tracking the release artifact)
- [ ] 1.2 Create `deploy/helm/copalibre/values.yaml` with a `roles` map (`web`, `api`, `events`, `worker`, `scheduler`), each entry carrying `image`, `replicas`, `resources`, `env`, `probePath`
- [ ] 1.3 Add `.helmignore`

## 2. Deployment and Job templates

- [ ] 2.1 Add `templates/deployment.yaml` iterating `.Values.roles` into one Deployment per role
- [ ] 2.2 Add `templates/service.yaml` for roles that accept traffic (`web`, `api`, `events`)
- [ ] 2.3 Add `templates/job-migrate.yaml` with `helm.sh/hook: pre-upgrade,pre-install`, `backoffLimit: 0`, `ttlSecondsAfterFinished`
- [ ] 2.4 Add `templates/job-doctor.yaml` as an on-demand (not hook-triggered) diagnostics Job
- [ ] 2.5 Add `templates/configmap.yaml` and `templates/secret.yaml` templating the same variable names `copalibre doctor` validates
- [ ] 2.6 Wire liveness/readiness/startup probes on every long-running Deployment to `.Values.roles.<name>.probePath`

## 3. Environment-contract parity

- [ ] 3.1 Write `scripts/check-helm-compose-parity.sh` diffing `docker-compose.yml` service `environment` keys against `values.yaml` `env` keys per matching role
- [ ] 3.2 Add a unit test for the parity script itself (fixture Compose file + fixture values.yaml, assert pass/fail cases)

## 4. K3s validation environment

- [ ] 4.1 Add `deploy/helm/k3s-dev-cluster.yaml` (k3d cluster config: node count >= 2 to exercise real scheduling)
- [ ] 4.2 Write `scripts/validate-k3s-release.sh`: create cluster, `helm install`, assert migration Job completes before any `api`/`worker` pod is ready, tear down

## 5. Integration tests (on real K3s)

- [ ] 5.1 Rolling-update test: `helm upgrade` to a new tag while polling `api`'s Service `/health` every 500ms; assert zero failed polls
- [ ] 5.2 Single-logical-scheduler test: deploy `scheduler` at `replicas: 2`; sample the lease-holder metric across both pods; assert exactly one holder at any instant
- [ ] 5.3 Failed-migration-blocks-rollout test: force the migration Job to fail; assert no new-release pod reaches Ready
- [ ] 5.4 Unhealthy-pod-not-routed test: force `api`'s `/health` to return 500; assert the Service stops routing to that pod

## 6. CI wiring

- [ ] 6.1 Add `helm-lint` job to `.github/workflows/ci.yml` (runs on every PR touching `deploy/helm/**`): `helm lint deploy/helm/copalibre`
- [ ] 6.2 Add the `check-helm-compose-parity.sh` script as a step in the same `helm-lint` job
- [ ] 6.3 Add a separate scheduled (e.g. nightly) `k3s-validate` workflow (not required on every PR, per design.md's flakiness/speed rationale) that provisions k3d, runs `validate-k3s-release.sh`, and runs tasks 5.1-5.4 as its assertion steps; alert only on consecutive failures
