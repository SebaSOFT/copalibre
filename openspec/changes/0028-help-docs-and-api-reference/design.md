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
- No custom documentation theme beyond Starlight's defaults plus CopaLibre's design tokens (phase 17) — a bespoke docs UI is out of scope.
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

**Scalar uses a pinned CDN document rather than `@scalar/astro`.** Official integration guidance
requires `renderMode="client"` for Starlight transitions, but `@scalar/astro` 0.4.12 declares only
Astro 4/5 peer support while CopaLibre is on Astro 7. Per the approved fallback, a plain Astro page
loads `@scalar/api-reference@1.64.0` from its CDN and points it only at same-origin
`/openapi/v1.json`. The Starlight sidebar marks that route `data-astro-reload`, so a full document
load initializes the CDN renderer instead of risking a blank transition-mounted page. Scalar request
execution, authentication UI, API clients, Agent, telemetry, developer tools and document download
are disabled by configuration.

**Pagefind is initialized on Astro's navigation lifecycle.** Starlight 0.41 registers Pagefind on
`DOMContentLoaded`, which can be missed when its client module arrives after `ClientRouter` begins
handling navigation. A small local wrapper retains Starlight's default UI and initializes the pinned
Pagefind UI on `astro:page-load`; it does nothing when Starlight's own initializer has already mounted
the search UI. This keeps search working after view transitions without replacing Starlight's layout.

## Risks / Trade-offs

- [Risk] Starlight spike passes today but a later Starlight upgrade reintroduces the pre-1.0
  instability. → Mitigation: pin the exact Starlight version; any version bump is a separate,
  reviewed change that re-runs the same spike criteria as a regression check.
- [Risk] CSS isolation between Starlight's theme and the public/control design tokens is subtle to
  verify. → Mitigation: an explicit visual/DOM test asserting no `design-tokens` (phase 17) CSS
  custom property is overridden by Starlight's own theme and vice versa.
- [Risk] The CDN renderer is unavailable when an installation has no external network access.
  → Mitigation: version-pin the URL and keep the OpenAPI artifact itself locally served; a future
  self-hosted renderer bundle can replace only the static script source without changing the route or
  document contract.
- [Risk] A Starlight update changes Pagefind's lifecycle or DOM contract. → Mitigation: pin both
  Starlight and Pagefind UI, and run the Playwright search scenario before accepting an upgrade.

## Migration Plan

N/A — new documentation surface. If the spike fails, no rollback is needed since nothing was built on
top of Starlight yet; the fallback proposal starts from a clean slate.

## Spike Result

**GO (2026-08-04).** `@astrojs/starlight` 0.41.6 is pinned and compatible with the existing Astro
7 application. The static build passed with Pagefind search, table of contents, locale routes and
Astro `ClientRouter`; the output isolation check confirms Starlight does not redefine `--cl-*` tokens
and public/control routes do not render Starlight markup. The documented Next.js+Nextra fallback is
not needed.
