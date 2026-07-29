## Context

`copalibre/` currently has no application code. The target architecture (`apps/`+`packages/`
layout, Yarn 4, NestJS 11 + Fastify, Astro, PostgreSQL) is fully decided in
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`. This design covers only
how to stand up that skeleton so it is real, CI-checked, and extensible by every later phase — not
whether the architecture is right (already settled).

## Goals / Non-Goals

**Goals:**
- Every `apps/*` and `packages/*` workspace exists, builds, type-checks, and lints clean from day one.
- CI fails a pull request on style or type errors before any feature code is written.
- Later phases (2 onward) add files inside this skeleton without touching root tooling config.

**Non-Goals:**
- No business logic, no database schema, no API surface — those belong to phases 2–8.
- No production Dockerfiles or deployment manifests — those belong to phase 21.
- No `copalibre` CLI implementation — only the health-endpoint stubs `copalibre doctor` will later check.

## Decisions

**NestJS CLI monorepo mode, not Nx or Turborepo.** `copalibre-platform-architecture.md` explicitly
references "NestJS monorepo workspaces" (the Nest CLI's own multi-app support) as the intended
mechanism, layered under plain Yarn workspaces for package resolution. Adding Nx or Turborepo on top
would introduce a second build-orchestration layer this project never asked for. Alternative
considered: Turborepo remote caching for CI speed — deferred; revisit only if CI duration becomes a
real bottleneck once phases 2+ add substantial test suites.

**Jest, not Vitest, for `apps/*` and TS packages.** Confirmed this session: NestJS's official testing
module (`@nestjs/testing`) and its CLI generators assume Jest; using Vitest would require manual
adapter work for every controller/provider test going forward. This diverges from `sebasoft-app`'s
Vitest convention deliberately — optimizing for NestJS-native tooling over cross-repo consistency.

**ESLint (flat config) + Prettier, not Biome.** Confirmed this session: matches the NestJS CLI
default and Astro's own ESLint integration story, and mirrors `sebasoft-app`'s zero-warnings policy
(`docs/ARCHITECTURAL_DECISIONS.md` in that repo) rather than `neuron-js`'s Biome choice — chosen
because CopaLibre's stack (Nest + Astro + React) has materially better-supported ESLint plugins for
each of those three frameworks than Biome does today.

**Stub health endpoints per process role now, not later.** Each `apps/{api,events,worker,scheduler,
migrate,doctor}` gets a `GET /health` (or process-exit-code equivalent for non-HTTP roles like
`migrate`) returning at least `{ role, version }`. This lets phase 21's `copalibre doctor` and the
eventual container healthchecks target a stable contract that existed since the first commit,
instead of being retrofitted.

**Docker Compose starts only PostgreSQL in this phase.** Application containers have no behavior yet;
starting empty NestJS apps in Compose here would just be noise. Phase 21
(`0021-deployment-docker-compose-cli`) is where the full multi-role Compose profile and Dockerfiles are
built.

## Risks / Trade-offs

- [Risk] Jest-vs-Vitest split from the rest of the SebaSOFT ecosystem raises onboarding friction for
  anyone used to `sebasoft-app`/`math-rocks-dice`. → Mitigation: document the reason (NestJS-native
  tooling) prominently in the root `README.md`'s contribution section, not just here.
- [Risk] Scaffolding 13 workspaces (7 apps + 6 packages) with only placeholder code risks bit-rot if
  phases 2+ are delayed. → Mitigation: CI enforces lint/typecheck on the placeholders themselves, so
  drift is caught immediately even with no behavior.
- [Risk] License-scan allowlist configured too narrowly blocks legitimate future dependencies. →
  Mitigation: allowlist by SPDX identifier class (MIT, Apache-2.0, BSD-*, ISC) rather than by exact
  package name, and document the manual-review path for anything else in `THIRD_PARTY_NOTICES.md`.

## Migration Plan

N/A — this is the first change in the repository; there is no prior state to migrate from or roll
back to. If this change needs to be reverted, deleting the branch before merge is sufficient.
