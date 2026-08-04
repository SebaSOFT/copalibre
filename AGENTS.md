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
```

Use focused commands while iterating, for example `yarn workspace @copalibre/web test --testPathPatterns 'match-console'`. Integration tests use PostgreSQL through `DATABASE_URL`; `yarn workspace @copalibre/persistence test:sqlite` is portable fast feedback, not replacement for PostgreSQL behavior. Before pushing, run `yarn workspace @copalibre/<workspace> test:coverage` for every touched workspace. Root `yarn test` does not enforce CI coverage thresholds.

## Code and Architecture

Use TypeScript with Prettier and ESLint. Follow existing two-space indentation, single quotes, semicolons, camelCase values, PascalCase components/classes, and nearby file naming conventions. Keep domain code framework-free: `packages/domain` and `packages/rules` must not import NestJS or Fastify.

Preserve system traceability. Mutations that affect tournament state require explicit authorization, audit records, and durable outbox events in the same transaction. Model sport behavior through `DisciplineDescriptor` data and rules; do not hardcode sport-specific UI or controller logic. Prefer UUIDs for identifiers and do not expose personal data unnecessarily.

## Domain Language and Data Evolution

Use `roster` only for selected players of one entrant in one match. Use `team membership` for a persistent person-team relation; never use roster or lineup for it.

Term migrations that rename tables, capabilities, or wire fields must provide reversible `up` and `down` paths. Preserve historical migrations as written, add compatibility coverage in PostgreSQL and SQLite, and verify persisted rows and capabilities survive both directions.

## Tests and Contracts

Add `*.test.ts(x)` beside unit-tested code and `*.integration.test.ts` for database or HTTP behavior. Test server-side authorization and validation even when the UI hides controls. A decorated controller must be registered in `AppModule`, listed in `OPENAPI_CONTROLLERS`, and declare schemas for every 2xx response; regenerate and commit `packages/contracts/openapi/v1.json` and generated types afterward. Fixtures must use lowercase kebab-case aliases and UUIDv7 opaque IDs; URL encoding never makes an invalid alias valid. For intentional incompatible API changes, bump `OPENAPI_VERSION`'s major version and generate with explicit breaking-change acceptance.

## Changes and Reviews

Use scoped Conventional Commit subjects, such as `feat(api): add match projection` or `fix(persistence): preserve elapsed clock`. Keep commits narrowly focused. PRs must describe behavior, OpenSpec change ID, tests run, migration/configuration impact, and screenshots for UI changes. `openspec/changes/` is ignored, so explicitly add approved change artifacts to commits. Never commit `.env` files, credentials, or production connection strings.
