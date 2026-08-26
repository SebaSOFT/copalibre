# deployment/kubernetes-enterprise Specification

## Purpose

Layers autoscaling, disruption protection, network policy, ingress, external secrets, and managed
external dependencies onto the K3s-validated Helm chart, and produces the measured multi-node
failover, backup/restore, and upgrade evidence the architecture doc requires before any
enterprise-readiness claim is made.

## Requirements

### Requirement: Additive, opt-in enterprise values
Every enterprise capability SHALL be expressed as a `values.yaml` group defaulted to disabled, such
that installing the chart with default values produces identical behavior to `0034-k3s-helm-deployment`
alone.

#### Scenario: Default install has no enterprise behavior active
- **WHEN** the chart is installed with default `values.yaml`
- **THEN** no HorizontalPodAutoscaler, PodDisruptionBudget, NetworkPolicy, Ingress, or ExternalSecret resource is created

### Requirement: Autoscaling on the three named signals
The `api`, `events`, and `worker` roles SHALL support autoscaling driven respectively by HTTP request
rate, active connection count, and outbox queue depth/age, when `autoscaling.enabled` is true for
that role.

#### Scenario: API scales on request rate
- **WHEN** `autoscaling.api.enabled` is true and the configured HTTP-rate threshold is sustained-exceeded
- **THEN** the `api` Deployment's replica count increases up to `autoscaling.api.maxReplicas`

#### Scenario: Worker scales on queue depth
- **WHEN** `autoscaling.worker.enabled` is true and outbox queue age exceeds the configured threshold
- **THEN** the `worker` Deployment's replica count increases up to `autoscaling.worker.maxReplicas`

### Requirement: Disruption protection and anti-affinity
When `podDisruptionBudget.enabled` is true for a role, a voluntary disruption (node drain, rolling
upgrade) SHALL never reduce that role's available replica count below the configured minimum, and
replicas of the same role SHALL prefer scheduling on different nodes.

#### Scenario: Node drain respects the disruption budget
- **WHEN** a node hosting an `api` replica is drained while `podDisruptionBudget.api.minAvailable` is set
- **THEN** the drain blocks or reschedules rather than reducing available `api` replicas below the configured minimum

### Requirement: Default-deny network policy with explicit role allowlists
When `networkPolicy.enabled` is true, each role SHALL default to denying all ingress except
explicitly allowed traffic for that role's documented needs, and internal-only roles (`worker`,
`scheduler`) SHALL accept no external ingress.

#### Scenario: Worker rejects external ingress
- **WHEN** `networkPolicy.enabled` is true
- **THEN** an inbound connection attempt to the `worker` pod from outside the cluster is rejected

### Requirement: Measured multi-node failover evidence
The project SHALL maintain a repeatable, scheduled validation producing dated evidence that a
single-node failure does not cause data loss or extended unavailability of `api`/`events`/`worker`
roles running with `replicas >= 2` across at least two nodes.

#### Scenario: Node failure does not interrupt service
- **WHEN** the scheduled validation forcibly terminates the node hosting one `api` replica
- **THEN** the remaining `api` replica continues serving requests and the terminated pod is rescheduled onto a healthy node within the documented recovery window

### Requirement: Measured backup and restore evidence
The project SHALL maintain a repeatable, scheduled validation producing dated evidence that a
PostgreSQL and object-storage backup restores into a clean Kubernetes installation and passes
integrity checks.

#### Scenario: Restore validation passes
- **WHEN** the scheduled validation restores the latest backup into a freshly provisioned cluster
- **THEN** the restored installation passes the same integrity checks defined for the Compose-level backup/restore requirement

### Requirement: Enterprise-readiness claims are evidence-gated
Documentation SHALL NOT assert Kubernetes enterprise-readiness without linking a dated, passing
evidence report from the multi-node-failover and backup-restore validations.

#### Scenario: Doc-lint blocks an unsupported claim
- **WHEN** `docs/deployment/enterprise-kubernetes.md` contains readiness language without a linked, passing, dated evidence report
- **THEN** the documentation-lint CI step fails

### Requirement: Kamal VM-bridge parity
The optional Kamal deployment path SHALL use the identical container images and environment-variable
contract as the Kubernetes and Docker Compose paths, with no Kamal-specific image or environment
variable introduced.

#### Scenario: Kamal deploy uses the same image digest
- **WHEN** a release is deployed via Kamal to managed VMs
- **THEN** the deployed image digest matches the digest validated by the rolling-update test for the same release
