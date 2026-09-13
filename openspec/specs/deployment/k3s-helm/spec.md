# deployment/k3s-helm Specification

## Purpose

Deploys the CopaLibre release artifact to a K3s cluster via one shared Helm chart, proving the
Docker Compose environment/health/migration contract holds unchanged on Kubernetes-API-compatible
infrastructure before Level-3 enterprise capabilities are added.

## Requirements

### Requirement: Single chart parameterized by process role
The Helm chart SHALL deploy every process role (`web`, `api`, `events`, `worker`, `scheduler`, and the
on-demand SSR renderer that serves the dynamic public routes) from one shared Deployment template
parameterized by a `roles` values map, and SHALL run `migrate` and `doctor` as Kubernetes Jobs, never
as Deployments. A role whose product role differs from its map key SHALL declare that product role in
its own values rather than inheriting the key.

#### Scenario: All roles deploy from one template
- **WHEN** `helm template deploy/helm/copalibre` is rendered with the default `values.yaml`
- **THEN** the output contains one Deployment per entry in `.Values.roles` and zero duplicated template logic across roles

#### Scenario: Migrate runs as a Job, not a long-running pod
- **WHEN** the chart is installed or upgraded
- **THEN** `apps/migrate` runs as a Kubernetes Job with `helm.sh/hook: pre-upgrade,pre-install` and `backoffLimit: 0`

#### Scenario: The SSR renderer is deployed and reachable
- **WHEN** the chart is installed
- **THEN** a Deployment and a Service exist for the on-demand SSR renderer, and the static web role's
  proxied routes resolve to it rather than failing to resolve a host that only exists in Docker Compose

#### Scenario: A role's product role can differ from its key
- **WHEN** a role's values declare a product role different from its map key
- **THEN** the rendered Deployment sets `PRODUCT_ROLE` to the declared value, and every other role
  continues to derive it from its key

### Requirement: Environment contract parity with Docker Compose
Every environment variable consumed by a process role in the Docker Compose profile SHALL be exposed
as a corresponding Helm value, with no K3s-only variable introduced for application configuration.
Parity SHALL extend to the services themselves: every long-running service in the Docker Compose
profile SHALL have a counterpart in the Helm chart, so an install path cannot ship a proxy target that
exists in only one of them.

#### Scenario: Variable-parity check passes
- **WHEN** the CI parity check compares `docker-compose.yml` service `environment` keys against
  `values.yaml` `env` keys for the same role
- **THEN** the two sets are identical and the check exits zero

#### Scenario: A new Compose-only variable is caught
- **WHEN** a pull request adds an environment variable to `docker-compose.yml` without adding it to `values.yaml`
- **THEN** the parity check fails in CI

#### Scenario: A Compose-only service is caught
- **WHEN** a pull request adds a long-running service to `docker-compose.yml` with no counterpart in the
  Helm chart
- **THEN** the parity check fails in CI, naming the service that has no chart counterpart

### Requirement: Health-probe wiring
Every long-running role's Deployment SHALL configure liveness, readiness, and startup probes against
that role's `GET /health` endpoint from `0001-bootstrap-monorepo-toolchain`. A role that proxies some of
its routes to another role SHALL probe a path it serves itself, never one it proxies, so a pod reports
its own health rather than its upstream's.

#### Scenario: Unhealthy pod is not routed traffic
- **WHEN** a deployed `api` pod's `/health` endpoint returns a non-2xx status
- **THEN** Kubernetes marks the pod not-ready and the Service stops routing traffic to it

#### Scenario: A proxying role probes its own surface
- **WHEN** the static web role's probe path is evaluated
- **THEN** it is a path that role's own server answers directly, so an unavailable proxy upstream cannot
  by itself make the role's pods fail to start

### Requirement: Migration blocks rollout
No `api` or `worker` pod belonging to a new release SHALL become ready before that release's
migration Job has completed successfully.

#### Scenario: Failed migration blocks the release
- **WHEN** the pre-upgrade migration Job fails
- **THEN** `helm upgrade` reports failure and no pod running the new release's image becomes ready

### Requirement: Single logical scheduler under multiple replicas
Running the `scheduler` role with more than one replica on K3s SHALL never result in two replicas
simultaneously holding the distributed lease, matching the lease contract from
`0017-worker-scheduler-async-jobs`, and SHALL settle into exactly one replica holding it.

#### Scenario: Two scheduler replicas, never a split-brain
- **WHEN** `scheduler` is deployed with `replicas: 2` on a validation K3s cluster
- **AND** the lease-holder metric is queried on both pods repeatedly over time
- **THEN** no sampled instant ever reports two pods simultaneously holding the lease, and the
  readings settle into a stable state where exactly one pod holds it

### Requirement: Zero-downtime rolling update
A `helm upgrade` to a new image tag SHALL complete a rolling update of the `api` role with no
observed request failure from a continuously-polling health client.

#### Scenario: Rolling update validation passes
- **WHEN** the validation script runs `helm upgrade` while polling `api`'s `/health` endpoint every
  500ms through a Service (not a single pod)
- **THEN** no poll during the rollout returns a connection error or non-2xx status

### Requirement: A proxied upstream is addressable in every supported install
A proxy configuration baked into a shipped image SHALL NOT hardcode a hostname that only one install
path can resolve. Every upstream host SHALL be resolvable in each supported install path, configurable
per install without rebuilding the image, and SHALL default to the value the Docker Compose profile
uses.

#### Scenario: The same image serves both install paths
- **WHEN** the web image runs under Docker Compose with no upstream override
- **THEN** it proxies to the Compose service name, unchanged from before this requirement

#### Scenario: Kubernetes points the upstream at its own Service
- **WHEN** the chart deploys the web role
- **THEN** it sets the upstream to the release-scoped Service name Kubernetes creates, and the proxied
  routes are served rather than returning a gateway error

### Requirement: A failed K3s validation run preserves its evidence
When the K3s release validation script fails, it SHALL emit the cluster state that explains the failure
— at least the pod list, the description of every pod that is not ready, and the logs of their
containers — before tearing the cluster down.

#### Scenario: A timed-out install reports what was not ready
- **WHEN** `helm install --wait` times out during validation
- **THEN** the run's output names the pods that never became ready and includes their events and
  container logs, rather than only the Helm timeout message
