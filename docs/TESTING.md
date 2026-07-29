# Testing conventions

Established by change `0001-bootstrap-monorepo-toolchain`; every later phase adds suites
inside these conventions instead of inventing new ones.

## Unit tests (Jest)

- Runner: Jest via `ts-jest`, configured by root `jest.config.js` fanning out to each
  workspace's `jest.config.cjs`, which extends `jest.config.base.cjs`.
- Location: colocated with source — `src/**/*.test.ts` (or `.test.tsx` for React).
- Run: `yarn test` (all workspaces) or `yarn workspace @copalibre/<name> run jest`.
- Coverage: `yarn test:coverage`.

## Integration tests (Jest + real PostgreSQL)

First used by phase `0004-persistence-postgres-outbox-audit`.

- Location: `src/**/*.integration.test.ts`, picked up by a workspace-level
  `jest.integration.config.cjs` (create it in the phase that first needs it; the root
  `jest.integration.config.js` already fans out to that glob).
- Run: `yarn test:integration`.
- Database: `docker compose -f docker-compose.dev.yml up -d postgres`, then set
  `DATABASE_URL=postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre`.
  Integration suites must read the connection string from `DATABASE_URL` only — never a
  hardcoded host — so CI can point them at a service container.
- Isolation: each suite owns its schema/tables and must clean up after itself; suites must
  stay runnable in parallel workers or explicitly set `maxWorkers: 1` in their config.

## E2E tests (Playwright)

- Config: root `playwright.config.ts`, targeting `apps/web`; specs live in `e2e/`.
- Run: `yarn test:e2e`. The dev server is auto-started by Playwright's `webServer`.
- Selector convention: prefer `getByRole`/`getByLabel`; use `data-testid` for elements with
  no accessible name (mirrors the pattern proven in sebasoft-app).

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, and the dependency license scan
on every pull request. Later phases append integration/e2e/build jobs per their tasks.md.
