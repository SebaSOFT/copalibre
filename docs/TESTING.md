# Testing conventions

Established by change `0001-bootstrap-monorepo-toolchain`; every later phase adds suites
inside these conventions instead of inventing new ones.

## ES modules

Every workspace is a native ES module (`0006-esm-module-migration`), which imposes two rules on
test code:

- **Relative imports carry `.js`**, matching the source: `import { x } from './x.js'`. Jest maps
  those back to the `.ts` sources via the shared mapper in `jest.esm-mapper.cjs`. A per-workspace
  config that defines its own `moduleNameMapper` must spread that mapper in rather than replace it.
- **`jest` is not a global.** Files using the mocking API must `import { jest } from '@jest/globals'`.

Jest's ESM mode needs `--experimental-vm-modules`, so every test script invokes Jest through
`node --experimental-vm-modules`. Because `--passWithNoTests` makes "discovered nothing" look
identical to success, `yarn test:verify-discovery` asserts a floor on discovered test files and runs
in CI ahead of the suites.

## Unit tests (Jest)

- Runner: Jest via `ts-jest` in ESM mode, configured by root `jest.config.js` fanning out to each
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

## Visual review (Storybook)

- Start: `yarn workspace @copalibre/web storybook` (port 6006). Local only — no static build, nothing
  hosted, not run in CI.
- Every owned library component has a `Playground` (all props adjustable) and a `Matrix` (variants
  side by side); the public and TV components and the generated token style guide are there too,
  grouped by surface.
- **This is not an automated gate.** There are no screenshot baselines and no visual diffing: a person
  looks. The one automated rule is that an owned library component without a sibling `*.stories.tsx`
  fails `scripts/check-ui-ownership.mjs`. That same check governs component ownership across every
  surface — operator, public and broadcast — and treats any `ui/` directory as the design language
  rather than a consumer of it.
- The two toolbar controls are where the value is. Set the language to German or Russian and the
  viewport to 188px — the zoom floor the token generator writes its responsive rules against — and
  most layout failures show up there before anywhere else.

Screen stories are grouped under `Admin/Screens`. Their shared `screen-story-fixtures.ts` holds
stable UUIDv7 identities, timestamps and typed projections. Each route story owns its API methods,
using `storyClient` to throw on undeclared reads instead of silently returning empty data.
Explicitly absent optional methods model unavailable capabilities. Loading promises remain pending;
failure fixtures reject. Workflow stories use `play` to enter states through the real controls.
The existing intl, toast and control-density decorators are reused.

`scripts/covered-control-screens.mjs` is the achieved-coverage register: removing a covered story
fails `check-ui-ownership.mjs`; adding a story requires extending the register. Uncovered screens
are allowed, unlike owned library components which all require stories. Run
`node --test scripts/check-ui-ownership.test.mjs` to exercise both directions.

Review every state in German at 1440, 767, 374 and 188px, then all eight languages at 188px.
Read `docs/SCREEN-STORY-REVIEW.md` before interpreting a loading/error example: several existing
screens intentionally expose their current incomplete UX rather than a fictional improved layout.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, and the dependency license scan
on every pull request. Later phases append integration/e2e/build jobs per their tasks.md.
