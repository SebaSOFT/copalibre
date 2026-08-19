# Repository Guidelines

## Scope and Structure

CopaLibre is a Yarn 4 TypeScript monorepo for tournament operations. Run commands from this directory. Applications live in `apps/` (`api`, `web`, `events`, workers); reusable domain and infrastructure code lives in `packages/`; operational decisions and implementation plans live in `openspec/`.

Read the active OpenSpec change before editing. Use `openspec validate <change> --strict` after updating its artifacts. Completed changes are synced and archived only after implementation and verification are complete.

## Commands

```bash
yarn install --immutable
yarn typecheck
yarn lint
yarn test
yarn test:integration
yarn test:e2e
yarn workspace @copalibre/api run openapi:generate
yarn workspace @copalibre/contracts run generate
yarn workspace @copalibre/web verify:docs
yarn test:e2e e2e/help-and-api-reference.spec.ts
yarn workspace @copalibre/seed test:sqlite
```

Use focused commands while iterating, for example `yarn workspace @copalibre/web test --testPathPatterns 'match-console'`. Integration tests use PostgreSQL through `DATABASE_URL`; `yarn workspace @copalibre/persistence test:sqlite` is portable fast feedback, not replacement for PostgreSQL behavior. Before pushing, run `yarn workspace @copalibre/<workspace> test:coverage` for every touched workspace. Root `yarn test` does not enforce CI coverage thresholds.

Yarn must use the conventional `node-modules` linker with the global cache. Do not enable PnP or Zero-Installs, and do not commit Yarn cache artifacts. Workspace scripts that execute a root development tool should follow the existing explicit `../../node_modules/.bin/<tool>` pattern when Yarn does not expose the hoisted binary.

## Code and Architecture

Use TypeScript with Prettier and ESLint. Follow existing two-space indentation, single quotes, semicolons, camelCase values, PascalCase components/classes, and nearby file naming conventions. Keep domain code framework-free: `packages/domain` and `packages/rules` must not import NestJS or Fastify.

Before editing an existing source file, use CodeGraph to locate the relevant symbol and read the exact current block, including imports and decorators. Prefer CodeGraph over grep, find, or sed for exploring or locating code generally, not only immediately before an edit — one `codegraph_explore` call typically returns verbatim source, call paths, and blast radius together, at a fraction of the round-trips a grep/read loop costs. Fall back to grep/find/sed only for what CodeGraph genuinely cannot answer. After every patch, inspect its focused `git diff` before compiling or testing; do not rely on a partial patch context to infer surrounding code.

Before adding a new domain primitive or abstraction, check whether an existing declarative mechanism already generalizes to the need — an `EventEffect`/`TargetAttribution` variant, a `ColumnSource` kind, an `ActorGranularity`/`CompetitionGranularity` value, an `EventWorkflow` branch. This codebase's mechanisms are frequently more general than any one discipline currently exercises; extending one at a setting it already supports is usually the right-sized change, not a new type.

Preserve system traceability. Mutations that affect tournament state require explicit authorization, audit records, and durable outbox events in the same transaction. Model sport behavior through `DisciplineDescriptor` data and rules; do not hardcode sport-specific UI or controller logic. Prefer UUIDs for identifiers and do not expose personal data unnecessarily.

Versioned first-party modules are JSON from `packages/module-catalogue/`, installed only through `apps/seed`; migrations and application startup never seed them. SQLite integration parsing must preserve `{{ ... }}` rule expressions as strings rather than treating them as nested JSON.

## Domain Language and Data Evolution

Use `roster` only for selected players of one entrant in one match. Use `team membership` for a persistent person-team relation; never use roster or lineup for it.

Term migrations that rename tables, capabilities, or wire fields must provide reversible `up` and `down` paths. Preserve historical migrations as written, add compatibility coverage in PostgreSQL and SQLite, and verify persisted rows and capabilities survive both directions.

## Tests and Contracts

Add `*.test.ts(x)` beside unit-tested code and `*.integration.test.ts` for database or HTTP behavior. Test server-side authorization and validation even when the UI hides controls. A decorated controller must be registered in `AppModule`, listed in `OPENAPI_CONTROLLERS`, and declare schemas for every 2xx response; regenerate and commit `packages/contracts/openapi/v1.json` and generated types afterward. Fixtures must use lowercase kebab-case aliases and UUIDv7 opaque IDs; URL encoding never makes an invalid alias valid. For intentional incompatible API changes, bump `OPENAPI_VERSION`'s major version and generate with explicit breaking-change acceptance.

## Help and API Reference

Keep Starlight, Pagefind, and Scalar dependencies pinned. `prefetch: false` in the Astro config is
intentional: Starlight otherwise injects prefetch JavaScript into public broadcast pages, which must
remain complete without JavaScript. Any docs dependency or ClientRouter lifecycle change requires
`yarn workspace @copalibre/web verify:docs` and the focused help Playwright spec.

The API reference reads the reviewed same-origin `/openapi/v1.json` artifact; it must never fetch a
live API document. Its Scalar route deliberately forces a full document load and keeps request
execution, authentication, client generation, telemetry, developer tools, and downloads disabled.

## CI and Infrastructure

Modifying cross-cutting infrastructure files (`docker-compose.yml`, `Dockerfile`, Helm chart in `deploy/helm/`) or other global configuration has cascading effects that are validated by custom repository scripts in `scripts/`. Do not assume an infrastructure change is isolated.
Before creating or updating a PR, you MUST guarantee the CI will pass by running the baseline monorepo validations locally:

- `yarn lint`
- `yarn format:check`
- `yarn typecheck`
- `yarn test` and/or `yarn test:integration` (for backend)
- `yarn test:e2e` (for frontend)

Crucially, if you modify **any** infrastructure or deployment file, you MUST explicitly run the repository's custom validation scripts locally before committing:

- `node scripts/check-helm-compose-parity.mjs`
- `node scripts/check-enterprise-readiness-docs.mjs`
- `node scripts/check-third-party-notices.mjs`

## Changes and Reviews

Use scoped Conventional Commit subjects, such as `feat(api): add match projection` or `fix(persistence): preserve elapsed clock`. Keep commits narrowly focused. PRs must describe behavior, OpenSpec change ID, tests run, migration/configuration impact, and screenshots for UI changes. Git ignore rules are authoritative: never force-add anything under `openspec/changes/`, whether active or archived. Commit only accepted specification deltas under `openspec/specs/`. Never commit `.env` files, credentials, or production connection strings.

## Feature Delivery Pipeline

Follow the `feature-delivery` skill for the full shape of shipping a change. The concrete cycle in this
repo: one OpenSpec change per branch, named `change/00NN-slug`, branched from `develop`. Implement its
tasks, then run the full local gate suite (`yarn lint`, `yarn format:check`, `yarn typecheck`, `yarn test`/`yarn
test:integration`, `yarn test:e2e` as applicable, plus the infra validation scripts above if
infrastructure files changed) and confirm every one is green before opening a PR against `develop`. Wait
for every required CI check to pass, then wait for explicit merge approval — do not merge a PR on your
own initiative, and an earlier approval does not carry forward to the next PR. Once merged, sync
`develop`, delete the local and remote feature branches, then archive the change with
`openspec archive <change> --yes`. Git ignore rules are authoritative: never force-add active or archived
change artifacts. Keep resulting accepted-spec deltas uncommitted on `develop`; on the next feature
branch, commit only those `openspec/specs/` deltas first
(`docs(openspec): promote NNNN specs into the accepted baseline`). Do not create a standalone PR for
promotion. Only then implement the next queued change, unless told to work ahead.
