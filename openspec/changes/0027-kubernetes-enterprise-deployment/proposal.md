## Why

`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` §"Level 3: Kubernetes plus
Helm" lists enterprise deployment as: "multiple API/event/worker replicas; disruption budgets and
anti-affinity; autoscaling from HTTP, connection, or queue metrics; managed PostgreSQL/Redis/object
storage; ingress and certificate policy; controlled migration jobs; network policies; external secret
integration; standardized observability and backup operators." Crucially, the same document's
"Explicit non-decisions and open gates" section states: **"Enterprise claims require measured
multi-node, failover, backup/restore, and upgrade evidence."** This phase exists to produce that
measured evidence on top of the Helm chart already validated on K3s (`0026-k3s-helm-deployment`) — it does
not merely assert enterprise-readiness, it tests for it, and this proposal explicitly does not claim
"production-ready for enterprise" until the acceptance criteria below are met with real evidence, not
documentation alone.

## What Changes

- Extend the `0026-k3s-helm-deployment` chart's `values.yaml` with enterprise-only value groups —
  `autoscaling`, `podDisruptionBudget`, `affinity`/`antiAffinity`, `networkPolicy`, `externalSecrets`,
  `ingress` — additive to the existing role-keyed structure, never a template fork.
- Add **HorizontalPodAutoscaler** templates for `api`, `events`, and `worker`, driven by HTTP
  request rate (`api`), active SSE connection count (`events`), and outbox queue depth/age (`worker`)
  — the three metrics named explicitly in the architecture doc.
- Add **PodDisruptionBudget** and pod **anti-affinity** rules so a node drain or rolling upgrade
  cannot take down every replica of a role simultaneously.
- Add **NetworkPolicy** templates restricting each role to only the traffic it needs (e.g. `worker`
  has no ingress from outside the cluster; only `api`/`events` accept external ingress).
- Add an **Ingress** template with TLS/cert-manager annotations, layered on top of (not replacing)
  the `Service` templates from `0026-k3s-helm-deployment`.
- Add adapters/documentation for **managed PostgreSQL, Redis, and S3-compatible object storage**
  (connection-string-driven, no code change to `packages/persistence`'s adapter boundary — it already
  targets any Postgres-compatible endpoint per the architecture doc).
- Add an **external-secrets integration** (e.g. External Secrets Operator) so credentials are not
  stored as plain Kubernetes `Secret` manifests in the chart.
- Add **standardized observability**: Prometheus-compatible metrics endpoints per role (reusing the
  telemetry minimums listed in the architecture doc's "Observability and operations" section) and a
  documented backup-operator integration for scheduled PostgreSQL/object-storage backups.
- Document the **optional Kamal VM-bridge path** as a documented alternative to full Kubernetes,
  explicitly "not a second product architecture" per the source doc — same images/env/health/migration
  contract, deployed to managed VMs instead of a cluster.
- Produce **measured evidence** (not claims) for: multi-node failover, backup/restore, and upgrade
  safety, gating any "enterprise-ready" language in documentation on this evidence existing.

## Capabilities

### New Capabilities
- `kubernetes-enterprise-deployment`: autoscaling, disruption-budget/anti-affinity, network-policy,
  external-secret, ingress, and managed-dependency support layered on the `0026-k3s-helm-deployment`
  chart, with measured multi-node failover/backup-restore/upgrade evidence gating any
  enterprise-readiness claim.

### Modified Capabilities
(none — `0026-k3s-helm-deployment`'s `values.yaml` gains additive enterprise value groups, defaulted off,
but no existing requirement from that capability changes; its parity/rolling-update/scheduler-lease
scenarios continue to pass unmodified, so no delta spec is needed for it)

## Impact

- **New files/dirs**: `deploy/helm/copalibre/templates/{hpa,pdb,networkpolicy,ingress,
  externalsecret}.yaml`, `docs/deployment/enterprise-kubernetes.md`, `docs/deployment/kamal.md`,
  `scripts/validate-multi-node-failover.sh`, `scripts/validate-backup-restore.sh`.
- **Dependencies introduced**: cert-manager and an ingress controller (documented cluster
  prerequisites, not chart dependencies), External Secrets Operator (documented prerequisite),
  `kamal` gem (optional, VM-bridge path only).
- **CI impact**: adds a scheduled (not per-PR) `k8s-enterprise-validate` workflow producing the
  measured multi-node/failover/backup-restore/upgrade evidence artifacts referenced above.
- **Documentation impact**: any marketing or README language claiming "enterprise-ready" or
  "production Kubernetes support" is gated on this phase's evidence artifacts existing and passing —
  see `design.md` Risks for the explicit anti-pattern this guards against.
