# CopaLibre build roadmap — OpenSpec change proposals

Every phase below is a complete OpenSpec change proposal (`proposal.md`, `design.md`, `tasks.md`,
`specs/<capability>/spec.md`) under this directory. All 27 currently pass `openspec validate
--strict`. None have been implemented or archived yet — this index exists because active change
directories use plain descriptive names (no numeric/date prefix; dates are only added at archive
time), so it is the one place that carries build order and status.

Source of truth for the product/architecture decisions each phase encodes: `../../../chaos-vault/`
(sibling repo). See each phase's `proposal.md` for exact file citations. Full roadmap rationale:
`/Users/sebasoft/.claude/plans/nested-juggling-shannon.md`.

Status legend: 🟢 proposed (this pass) · ⚪ not yet started · — none are implemented yet.

## Foundation

| # | Change | Capability | Status |
|---|---|---|---|
| 1 | [`0001-bootstrap-monorepo-toolchain`](0001-bootstrap-monorepo-toolchain/) | `monorepo-toolchain` | 🟢 |

## Domain & rules

| # | Change | Capability | Status |
|---|---|---|---|
| 2 | [`0002-domain-model-core`](0002-domain-model-core/) | `tournament-domain-model` | 🟢 |
| 3 | [`0003-rules-engine-neuron-js-adapter`](0003-rules-engine-neuron-js-adapter/) | `rules-engine` | 🟢 |

## Persistence & API

| # | Change | Capability | Status |
|---|---|---|---|
| 4 | [`0004-persistence-postgres-outbox-audit`](0004-persistence-postgres-outbox-audit/) | `persistence-layer` | 🟢 |
| 5 | [`0005-api-auth-jwt-openapi-contract`](0005-api-auth-jwt-openapi-contract/) | `api-auth-contract` | 🟢 |

## Tournament engine (P0)

| # | Change | Capability | Status |
|---|---|---|---|
| 6 | [`0006-tournament-engine-fixtures-mvp-formats`](0006-tournament-engine-fixtures-mvp-formats/) | `tournament-fixture-engine` | 🟢 |
| 7 | [`0007-resource-scheduling-and-conflicts`](0007-resource-scheduling-and-conflicts/) | `resource-scheduling` | 🟢 |
| 8 | [`0008-live-match-operations-result-authority`](0008-live-match-operations-result-authority/) | `live-match-operations`, `result-correction-authority` | 🟢 |

## Async & realtime

| # | Change | Capability | Status |
|---|---|---|---|
| 9 | [`0009-worker-scheduler-async-jobs`](0009-worker-scheduler-async-jobs/) | `async-job-processing` | 🟢 |
| 10 | [`0010-realtime-sse-contract`](0010-realtime-sse-contract/) | `realtime-events` | 🟢 |

## Design system

| # | Change | Capability | Status |
|---|---|---|---|
| 11 | [`0011-design-tokens-broadcast-command-precision`](0011-design-tokens-broadcast-command-precision/) | `design-tokens` | 🟢 |

## Public web (P0)

| # | Change | Capability | Status |
|---|---|---|---|
| 12 | [`0012-public-web-astro-shell`](0012-public-web-astro-shell/) | `public-web-shell` | 🟢 |
| 13 | [`0013-public-live-and-bracket-surfaces`](0013-public-live-and-bracket-surfaces/) | `public-live-surfaces` | 🟢 |

## Control web (P0)

| # | Change | Capability | Status |
|---|---|---|---|
| 14 | [`0014-control-web-shell-and-org-dashboard`](0014-control-web-shell-and-org-dashboard/) | `control-web-shell` | 🟢 |
| 15 | [`0015-tournament-authoring-and-registration-review`](0015-tournament-authoring-and-registration-review/) | `tournament-authoring` | 🟢 |
| 16 | [`0016-standings-bracket-builder-control`](0016-standings-bracket-builder-control/) | `standings-explainability`, `bracket-seeding-builder` | 🟢 |
| 17 | [`0017-live-match-console-a4`](0017-live-match-console-a4/) | `live-match-console` | 🟢 |
| 18 | [`0018-roles-permissions-rbac`](0018-roles-permissions-rbac/) | `roles-permissions` | 🟢 |

## Data ownership & docs

| # | Change | Capability | Status |
|---|---|---|---|
| 19 | [`0019-csv-import-export-data-ownership`](0019-csv-import-export-data-ownership/) | `data-import-export` | 🟢 |
| 20 | [`0020-help-docs-and-api-reference`](0020-help-docs-and-api-reference/) | `help-and-api-docs` | 🟢 |

## Deployment level 1 (completes the CI pipeline)

| # | Change | Capability | Status |
|---|---|---|---|
| 21 | [`0021-deployment-docker-compose-cli`](0021-deployment-docker-compose-cli/) | `self-hosted-deployment` | 🟢 |

## Broadcast

| # | Change | Capability | Status |
|---|---|---|---|
| 22 | [`0022-broadcast-venue-tv-surfaces`](0022-broadcast-venue-tv-surfaces/) | `broadcast-tv-surfaces` | 🟢 |

## P1

| # | Change | Capability | Status |
|---|---|---|---|
| 23 | [`0023-multi-stage-progression`](0023-multi-stage-progression/) | `multi-stage-progression` (TMS-012) | 🟢 |
| 24 | [`0024-participant-reporting-and-disputes`](0024-participant-reporting-and-disputes/) | `participant-reporting` (TMS-013) | 🟢 |
| 25 | [`0025-competition-lifecycle-and-archival`](0025-competition-lifecycle-and-archival/) | `competition-lifecycle` (TMS-014) | 🟢 |

## Enterprise deployment

| # | Change | Capability | Status |
|---|---|---|---|
| 26 | [`0026-k3s-helm-deployment`](0026-k3s-helm-deployment/) | `k3s-helm-deployment` | 🟢 |
| 27 | [`0027-kubernetes-enterprise-deployment`](0027-kubernetes-enterprise-deployment/) | `kubernetes-enterprise-deployment` | 🟢 |

## Dependency notes

- Phases 2–3 depend only on phase 1's scaffold.
- Phases 4–8 depend on phases 2–3 (domain types, rules engine) and phase 1.
- Phases 9–10 depend on phase 4 (outbox) and phase 8 (commands to relay/stream).
- Phase 11 has no code dependency but should land before any UI phase (12+) consumes its tokens.
- Phases 12–13 (public web) depend on phase 10 (SSE) and phase 11 (tokens); phase 12 also owns
  `packages/routing`, which phase 22 (`/tv/**`) reuses rather than inventing a second URL scheme.
- Phases 14–18 (control web) depend on phase 5 (API/auth), phase 11 (tokens), and — for 16 —
  phase 6 (fixture engine) and phase 3 (rules engine, for the trace-equality contract test).
- Phase 19 depends on phases 2 and 4. Phase 20 depends on phase 5 (OpenAPI artifact).
- Phase 21 depends on every app/package existing in a buildable state (1–20) and is the phase that
  completes the CI pipeline shape (`install→lint→typecheck→unit→integration→e2e→build→deploy-smoke-test`).
- Phase 22 depends on phase 10 (reuses the public SSE channel) and phase 12 (`packages/routing`);
  it resolves the previously-open device-scoped display-token gate from `copalibre-platform-architecture.md`.
- Phases 23–25 (P1) depend on phase 8's correction workflow and are deliberately kept as *extensions*
  of it, never a second mutation path.
- Phases 26–27 depend on phase 21 (same images/env contract/health checks, "an evolution, not a
  rewrite" per architectural principle 8) and are gated behind measured multi-node/failover/
  backup-restore/upgrade evidence before any enterprise-readiness claim is made.

## Explicit open gates tracked across this roadmap

Per `chaos-vault`'s own "Explicit non-decisions and open gates" section, the following are
deliberately **not** silently resolved anywhere above — each phase's `design.md` states whether it
resolves, defers, or works within the gate:

- Double-elimination bracket layout — **resolved** in phase 6.
- Device-scoped display-token mechanism for `/tv/**` — **resolved** in phase 22.
- Concrete queue adapter (PostgreSQL outbox is durable-source-of-truth; Redis/BullMQ optional,
  never authoritative) — **not selected**, phases 9/10 work within the durability contract only.
- Identity provider selection — **not selected**, phases 5/18 work within the JWT Bearer + PKCE
  contract only.
- Tenant-vs-organization terminology, camelCase leaks in token dot-paths — **still open**, flagged
  in phases 2 and 11 respectively.
- Enterprise readiness claims — **explicitly gated** behind phase 27's measured evidence, not
  assumed from the Helm chart alone.
