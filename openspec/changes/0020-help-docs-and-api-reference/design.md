## Context

The framework choice (Astro/Starlight/Scalar) is already decided and defended in
`../chaos-vault/50-research/help-documentation-and-openapi-reference-2026.md` against five
alternatives. This design covers only how to validate that decision safely (given its own stated
pre-1.0 risk) and how the static-artifact/no-live-fetch contract is implemented.

## Goals / Non-Goals

**Goals:**
- The pre-1.0 risk in the Starlight decision is resolved by evidence (a passing spike), not by hope.
- `/help/api-reference/` never depends on a live API being reachable.

**Non-Goals:**
- No custom documentation theme beyond Starlight's defaults plus CopaLibre's design tokens (phase
  11) — a bespoke docs UI is out of scope.
- No live "Try It" console in this phase — explicitly deferred per the source doc's own guidance that
  any future interactive console needs a separate same-origin/credential-scoping design.

## Decisions

**Spike runs first and gates the rest of the phase's tasks.** Rather than building `/help/**` content
on an unvalidated framework and discovering integration problems late, `tasks.md` places the spike as
task group 1 with explicit pass/fail criteria; every other task group is sequenced after it.

**Fallback is a separate future change, not an in-place branch.** If the spike fails, this phase does
not silently swap to Next.js+Nextra mid-implementation — that would mean two half-finished doc stacks
in one change. Instead, this phase's own spec requirement records the fallback as the *next* proposed
change, keeping each change's diff coherent.

**OpenAPI artifact generation happens in CI, not at Astro build time.** `apps/api`'s Nest build
generates the OpenAPI document; contract linting and breaking-change checks run against it; only then
is it copied to `public/openapi/v1.json` for the Astro static build to consume. This keeps the Astro
build hermetic (no network calls) and keeps API-contract quality checks in the same pipeline stage as
the artifact's generation, not scattered.

## Risks / Trade-offs

- [Risk] Starlight spike passes today but a later Starlight upgrade reintroduces the pre-1.0
  instability. → Mitigation: pin the exact Starlight version; any version bump is a separate,
  reviewed change that re-runs the same spike criteria as a regression check.
- [Risk] CSS isolation between Starlight's theme and the public/control design tokens is subtle to
  verify. → Mitigation: an explicit visual/DOM test asserting no `design-tokens` (phase 11) CSS
  custom property is overridden by Starlight's own theme and vice versa.

## Migration Plan

N/A — new documentation surface. If the spike fails, no rollback is needed since nothing was built on
top of Starlight yet; the fallback proposal starts from a clean slate.
