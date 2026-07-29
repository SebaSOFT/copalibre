## Context

`0026-k3s-helm-deployment` already produced a working Helm chart validated on K3s for the base contract
(rolling update, health probes, migration-blocks-rollout, single-logical-scheduler). This design
covers only the enterprise-only additions layered on that chart, and — per the architecture doc's
explicit open gate — how this phase produces *measured* evidence rather than an unverified claim of
enterprise readiness. See `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`
§"Level 3: Kubernetes plus Helm" and §"Explicit non-decisions and open gates".

## Goals / Non-Goals

**Goals:**
- Every enterprise capability (autoscaling, PDB/anti-affinity, network policy, ingress, external
  secrets, managed dependencies) is expressed as additive `values.yaml` groups, defaulted off, so the
  chart remains identical for K3s-only users who don't opt in.
- Multi-node failover, backup/restore, and upgrade safety are proven with a real test run and an
  artifact (log/report) checked into CI history — not asserted in prose.
- The Kamal VM-bridge path is documented as a genuine alternative, not a second architecture requiring
  separate images or environment contracts.

**Non-Goals:**
- No claim that CopaLibre is "enterprise-ready" is made by this phase alone — that claim requires the
  evidence this phase produces to actually exist and pass, and remains a documentation/marketing
  decision outside this phase's scope.
- No new business logic or API surface — purely deployment/operations tooling.
- No commitment to a specific managed-Postgres/Redis/S3 vendor — adapters are connection-string-driven
  and vendor-agnostic, per `packages/persistence`'s existing adapter boundary.

## Decisions

**Autoscaling metrics: HTTP rate (`api`), connection count (`events`), queue depth/age (`worker`) —
exactly the three named in the architecture doc, no others invented.** Using anything not explicitly
named (e.g. CPU-based autoscaling) would be a silent addition beyond what chaos-vault decided.
CPU/memory-based HPA remains available as a values-level option but is not the documented default,
since the architecture doc is explicit these three are the intended signals.

**PodDisruptionBudget + anti-affinity are separate from autoscaling, not bundled.** A user might want
disruption protection without autoscaling (e.g. a fixed-size enterprise deployment). Bundling them
would force an all-or-nothing enterprise toggle the architecture doc doesn't ask for.

**Network policy defaults to default-deny with explicit allow rules per role**, not an allow-all
baseline with enterprise users opting into restriction. This matches "Security boundaries follow
exposure" (architectural principle 10) — public-facing roles (`api`, `events`, `web`) get ingress
rules; `worker`/`scheduler` get none by default.

**Managed dependencies require zero code changes, only configuration**, because `packages/persistence`
already targets "PostgreSQL" generically via `pg`+Kysely with no code assuming a specific hosting
model, and object storage is already behind an S3-compatible adapter per the architecture doc. This
phase's job is documentation and connection-string wiring, not new adapter code.

**"Enterprise-ready" is an evidence-gated claim, enforced structurally, not just by convention.** The
scheduled validation workflow (task group 6) writes a dated evidence report; `docs/deployment/
enterprise-kubernetes.md` is required (via a doc-lint task) to link the most recent passing report
rather than asserting readiness unconditionally. This directly implements the source doc's "Enterprise
claims require measured... evidence" gate as a structural check, not just a written policy.

## Risks / Trade-offs

- [Risk] Someone (marketing, README, a future contributor) claims "enterprise Kubernetes support" before
  the measured-evidence workflow has ever passed. → Mitigation: the doc-lint task fails the build if
  `enterprise-kubernetes.md` asserts readiness without a linked, dated, passing evidence report.
- [Risk] Default-deny NetworkPolicy breaks an unanticipated legitimate flow (e.g. worker needing
  egress to a webhook target). → Mitigation: NetworkPolicy is itself a `values.yaml`-gated, opt-in
  addition (default `networkPolicy.enabled: false`) until the failover/backup-restore validation
  proves it doesn't break required flows.
- [Risk] Autoscaling on outbox queue depth/age requires a custom metrics adapter (these aren't native
  Kubernetes metrics) — added complexity. → Mitigation: document the specific custom-metrics-adapter
  requirement explicitly rather than silently falling back to CPU-based scaling, which would violate
  the "exactly these three signals" decision above.
- [Risk] The Kamal VM-bridge path silently diverges from the Kubernetes path over time (two
  deployment targets to keep in sync). → Mitigation: Kamal reuses the identical container images and
  environment contract validated by `0026-k3s-helm-deployment` and this phase — no Kamal-specific
  Dockerfile or env var is permitted.

## Migration Plan

Additive only, gated behind opt-in `values.yaml` flags defaulted to `false`/disabled. No existing
K3s or Compose deployment is affected by merging this phase. Rollback is disabling the relevant
`values.yaml` flag; no data-migration is involved since this phase changes deployment topology, not
schema.
