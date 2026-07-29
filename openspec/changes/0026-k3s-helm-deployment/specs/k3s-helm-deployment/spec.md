## Purpose

Deploys the CopaLibre release artifact to a K3s cluster via one shared Helm chart, proving the
Docker Compose environment/health/migration contract holds unchanged on Kubernetes-API-compatible
infrastructure before Level-3 enterprise capabilities are added.

## ADDED Requirements

### Requirement: Single chart parameterized by process role
The Helm chart SHALL deploy every process role (`web`, `api`, `events`, `worker`, `scheduler`) from
one shared Deployment template parameterized by a `roles` values map, and SHALL run `migrate` and
`doctor` as Kubernetes Jobs, never as Deployments.

#### Scenario: All roles deploy from one template
- **WHEN** `helm template deploy/helm/copalibre` is rendered with the default `values.yaml`
- **THEN** the output contains one Deployment per entry in `.Values.roles` and zero duplicated template logic across roles

#### Scenario: Migrate runs as a Job, not a long-running pod
- **WHEN** the chart is installed or upgraded
- **THEN** `apps/migrate` runs as a Kubernetes Job with `helm.sh/hook: pre-upgrade,pre-install` and `backoffLimit: 0`

### Requirement: Environment contract parity with Docker Compose
Every environment variable consumed by a process role in the Docker Compose profile SHALL be exposed
as a corresponding Helm value, with no K3s-only variable introduced for application configuration.

#### Scenario: Variable-parity check passes
- **WHEN** the CI parity check compares `docker-compose.yml` service `environment` keys against
  `values.yaml` `env` keys for the same role
- **THEN** the two sets are identical and the check exits zero

#### Scenario: A new Compose-only variable is caught
- **WHEN** a pull request adds an environment variable to `docker-compose.yml` without adding it to `values.yaml`
- **THEN** the parity check fails in CI

### Requirement: Health-probe wiring
Every long-running role's Deployment SHALL configure liveness, readiness, and startup probes against
that role's `GET /health` endpoint from `0001-bootstrap-monorepo-toolchain`.

#### Scenario: Unhealthy pod is not routed traffic
- **WHEN** a deployed `api` pod's `/health` endpoint returns a non-2xx status
- **THEN** Kubernetes marks the pod not-ready and the Service stops routing traffic to it

### Requirement: Migration blocks rollout
No `api` or `worker` pod belonging to a new release SHALL become ready before that release's
migration Job has completed successfully.

#### Scenario: Failed migration blocks the release
- **WHEN** the pre-upgrade migration Job fails
- **THEN** `helm upgrade` reports failure and no pod running the new release's image becomes ready

### Requirement: Single logical scheduler under multiple replicas
Running the `scheduler` role with more than one replica on K3s SHALL result in exactly one replica
holding the distributed lease at any moment, matching the lease contract from
`0009-worker-scheduler-async-jobs`.

#### Scenario: Two scheduler replicas, one active lease holder
- **WHEN** `scheduler` is deployed with `replicas: 2` on a validation K3s cluster
- **AND** the lease-holder metric is queried on both pods
- **THEN** exactly one pod reports itself as lease holder at any sampled instant

### Requirement: Zero-downtime rolling update
A `helm upgrade` to a new image tag SHALL complete a rolling update of the `api` role with no
observed request failure from a continuously-polling health client.

#### Scenario: Rolling update validation passes
- **WHEN** the validation script runs `helm upgrade` while polling `api`'s `/health` endpoint every
  500ms through a Service (not a single pod)
- **THEN** no poll during the rollout returns a connection error or non-2xx status
