## Context

By this phase, `0021-deployment-docker-compose-cli` has already produced per-role container images,
a `copalibre` CLI, and a documented environment-variable contract validated by `copalibre doctor`.
This design covers only how those same artifacts get deployed to K3s via Helm — not what the
application does, which is unchanged. See `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`
§"Level 2: K3s plus Helm" and §"One release, multiple process roles" for the accepted target shape.

## Goals / Non-Goals

**Goals:**
- One Helm chart parameterizes every process role via `values.yaml` — no per-role chart forks.
- The chart is provably compatible with the Level-3 Kubernetes phase without redesign (same
  templates, Level 3 only adds autoscaling/disruption-budget/network-policy values on top).
- A rolling update on K3s never serves traffic from a pod whose migration hasn't run.

**Non-Goals:**
- No autoscaling, disruption budgets, network policies, or managed-database integration — those are
  `0027-kubernetes-enterprise-deployment` (Level 3) concerns, added as chart values without changing the
  template structure built here.
- No production traffic is intended to run on K3s specifically; K3s here is the *validation*
  environment proving the chart contract, per the architecture doc's explicit sequencing.

## Decisions

**One chart, role selected by a values sub-map, not seven charts.** A single `templates/deployment.yaml`
iterated over `.Values.roles` (a map of role name → replica count, resources, probe path) keeps the
chart DRY and guarantees `web`/`api`/`events`/`worker`/`scheduler` never drift from a shared template.
Alternative considered: one subchart per role — rejected, adds Helm dependency-management overhead
for roles that share ~90% of their template logic (image, probes, env, resources).

**Migration as a Helm pre-upgrade hook Job, not an init container.** `apps/migrate` must run to
completion exactly once per release before any `api`/`worker` pod serving that release becomes ready.
A `helm.sh/hook: pre-upgrade,pre-install` Job blocks the release rollout until migration succeeds,
matching the Compose profile's "one controlled migration entrypoint" principle. An init container per
pod was rejected — it would attempt the migration once per replica, racing concurrent migration
attempts under `replicas: 2+`.

**K3s validation runs on a schedule/manual trigger, not every PR.** Spinning up a k3d cluster and
running a real rolling-update assertion is materially slower and flakier than the existing
lint/typecheck/unit/e2e/build jobs. It validates infrastructure, not application code — a PR
touching only `apps/api` business logic doesn't need to re-prove K3s compatibility. `helm lint` (fast,
static) still runs on every PR that touches `deploy/helm/**`.

**One logical scheduler is proven by a real K3s lease test, not mocked.** Rather than unit-testing the
lease algorithm in isolation (already covered by `0009-worker-scheduler-async-jobs`), this phase's
acceptance test runs `replicas: 2` for `scheduler` on a real K3s cluster and asserts exactly one pod
holds the lease at any moment — this is an infrastructure-integration claim, not a unit-testable one.

## Risks / Trade-offs

- [Risk] k3d-based CI validation is slower and flakier than pure-container jobs, risking a noisy
  scheduled job that gets ignored. → Mitigation: alert only on consecutive failures, not single
  flakes; keep it separate from the required PR-blocking job set.
- [Risk] Chart drifts from the Compose environment contract over time as new env vars are added to
  one but not the other. → Mitigation: a CI check (added in this phase's tasks) diffs the variable
  names referenced in `docker-compose.yml` against `values.yaml`'s `env` keys and fails on mismatch.
- [Risk] Treating migration purely as a hook Job risks a stuck release if the hook fails silently. →
  Mitigation: `backoffLimit: 0` (fail fast, no silent retries) and the hook Job's failure blocks
  `helm upgrade` from proceeding, surfaced in the validation script's exit code.

## Migration Plan

Additive only — no existing deployment path changes. Rollback is `helm uninstall` on the K3s cluster
used for validation; no production rollback plan is needed since K3s is not yet a production target
in this phase (that claim is deferred to `0027-kubernetes-enterprise-deployment`, and only with measured
evidence per that phase's explicit gate).
