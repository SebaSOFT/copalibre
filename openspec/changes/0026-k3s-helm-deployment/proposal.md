## Why

`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` defines a three-level
"Deployment ladder": Docker Compose (Level 1, built in `0021-deployment-docker-compose-cli`), K3s
plus Helm (Level 2), and Kubernetes plus Helm (Level 3). Architectural principle 8 states
"Enterprise deployment is an evolution, not a rewrite. Compose, K3s, and Kubernetes use the same
images, environment contract, health checks, migration process, and persistent-data model." Step 11
of the doc's "Initial implementation sequence" is explicit: "Produce Helm chart and validate the
same release contract on K3s before claiming Kubernetes support." This phase is that step: author
the Helm chart once and prove it holds the Level-1 contract on a real multi-node K3s cluster before
`0027-kubernetes-enterprise-deployment` (Level 3) adds enterprise-only capabilities on top of it.

## What Changes

- Add a **Helm chart** (`deploy/helm/copalibre/`) with one template set covering every process role
  from `0021-deployment-docker-compose-cli`: `web`, `api`, `events`, `worker`, `scheduler`, plus
  Job templates for `migrate` and `doctor` (one-shot roles, not long-running Deployments).
- Chart values SHALL reuse the **same container images and environment-variable contract** as the
  Docker Compose profile — no K3s-only environment variables, no divergent config surface.
- Add per-role `Deployment`/`Job` templates with **liveness/readiness/startup probes** wired to the
  `GET /health` endpoints established in `0001-bootstrap-monorepo-toolchain`.
- Add a `Secret`/`ConfigMap` templating layer that accepts the same variable names `copalibre doctor`
  already validates (from `0021-deployment-docker-compose-cli`), so `doctor` output is directly
  actionable in a K3s deployment too.
- Add a **migration Job** template that runs `apps/migrate` to completion (`Job` with
  `backoffLimit`/`ttlSecondsAfterFinished`) as a pre-upgrade Helm hook, never as a Deployment.
- Document a **K3s validation environment** (a local multi-node K3s cluster — e.g. `k3d`) and a
  scripted validation pass proving: rolling update with zero downtime, one logical `scheduler`
  replica under `replicas: 2+`, `events` SSE reconnection across a pod restart, and the migration Job
  hook completing before any new `api`/`worker` pod becomes ready.
- **BREAKING**: none — this phase is additive; Docker Compose remains the documented Level 1 path and
  is not removed or altered.

## Capabilities

### New Capabilities
- `k3s-helm-deployment`: a Helm chart that deploys every CopaLibre process role to a K3s cluster
  using the same images/environment/health-check/migration contract as the Docker Compose profile,
  validated with a real rolling-update and single-logical-scheduler test on K3s.

### Modified Capabilities
(none — this phase does not change any existing capability's requirements, only adds a new
deployment target for the release artifact already defined by `0021-deployment-docker-compose-cli`)

## Impact

- **New files/dirs**: `deploy/helm/copalibre/{Chart.yaml,values.yaml,templates/**}`, a `k3d`-based
  local validation cluster config (`deploy/helm/k3s-dev-cluster.yaml`), a validation script
  (`scripts/validate-k3s-release.sh`).
- **Dependencies introduced**: `helm` CLI (dev/CI tooling only, not a runtime dependency), `k3d` or
  equivalent (CI tooling only).
- **CI impact**: adds a `helm-lint` job (chart lints clean) and an optional/scheduled `k3s-validate`
  job (spins up a k3d cluster, `helm install`, runs the rolling-update + scheduler-lease assertions)
  to `.github/workflows/ci.yml` — see `design.md` for why this job runs on a schedule/manual trigger
  rather than every pull request.
- **No runtime behavior change** to any CopaLibre process role itself — this phase only adds a second
  way to deploy the artifact already produced by `0021-deployment-docker-compose-cli`.
