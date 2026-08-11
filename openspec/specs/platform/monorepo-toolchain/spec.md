# monorepo-toolchain Specification

## Purpose
Gives every later CopaLibre change a working repository skeleton — workspace layout, package
manager, TypeScript wiring, lint/format gate, base test runners, and CI — so feature phases only add
behavior, never re-derive toolchain setup.
## Requirements
### Requirement: Workspace layout
The repository SHALL provide a Yarn workspace containing `apps/api`, `apps/events`, `apps/worker`,
`apps/scheduler`, `apps/migrate`, `apps/doctor`, `apps/web`, and `packages/domain`, `packages/rules`,
`packages/persistence`, `packages/contracts`, `packages/design-tokens`, `packages/routing`, matching
the layout in `copalibre-platform-architecture.md`. Every workspace SHALL declare
`"type": "module"` and be resolved with TypeScript's `nodenext` module resolution.

#### Scenario: Fresh clone installs cleanly
- **WHEN** a developer clones the repository and runs `yarn install --immutable`
- **THEN** installation succeeds with no lockfile drift and no Plug'n'Play artifacts are created

#### Scenario: Every declared app and package resolves
- **WHEN** `yarn workspaces list` is run
- **THEN** it lists every `apps/*` and `packages/*` workspace declared above, each with a valid `package.json`

#### Scenario: Every workspace is an ES module
- **WHEN** each `apps/*` and `packages/*` `package.json` is inspected
- **THEN** it declares `"type": "module"`

### Requirement: TypeScript project references
Every `apps/*` and `packages/*` workspace SHALL be wired into a root TypeScript project-reference
graph so a change in a `packages/*` source file is picked up by `apps/*` type-checking without a
publish step. Relative imports SHALL carry explicit file extensions, as Node's ES module resolver
requires.

#### Scenario: Cross-package type change is caught
- **WHEN** a type exported from `packages/domain` is changed incompatibly
- **AND** `yarn typecheck` is run at the repo root
- **THEN** type-checking fails in any `apps/*` workspace that consumes the changed type

#### Scenario: A relative import missing its extension fails type-checking
- **WHEN** a relative import is written without a `.js` extension
- **AND** `yarn typecheck` is run
- **THEN** type-checking fails, rather than deferring the failure to a runtime `ERR_MODULE_NOT_FOUND`

### Requirement: Zero-warnings lint gate
The repository SHALL enforce an ESLint + Prettier gate across TypeScript, Astro, and React/TSX
sources with zero tolerated warnings, matching the policy documented for `sebasoft-app`.

#### Scenario: Lint warning fails the gate
- **WHEN** `yarn lint` is run against a source file containing any ESLint warning
- **THEN** the command exits non-zero

#### Scenario: Clean tree passes
- **WHEN** `yarn lint` is run against the scaffolded, unmodified repository
- **THEN** the command exits zero

### Requirement: Base test runner configuration
The repository SHALL provide a root Jest configuration usable by every `apps/*` and `packages/*`
workspace, running in ES module mode, and a root Playwright configuration targeting `apps/web`, even
before any test files exist.

#### Scenario: Empty test suite does not fail CI
- **WHEN** `yarn test` is run against a workspace with no test files
- **THEN** the command reports zero tests found and exits zero (not an error)

#### Scenario: ES module test files execute
- **WHEN** a test file imports application source using an explicit `.js` specifier
- **THEN** Jest resolves it to the corresponding TypeScript source and the suite runs

### Requirement: Continuous integration on pull requests
The repository SHALL run a GitHub Actions workflow on every pull request that installs dependencies
immutably, runs the lint gate, runs the TypeScript type-check, and runs a dependency license scan.

#### Scenario: A pull request with a lint violation is blocked
- **WHEN** a pull request introduces a file that fails `yarn lint`
- **THEN** the `lint` job in `.github/workflows/ci.yml` fails and the pull request shows a failing check

#### Scenario: A pull request adding a disallowed license is blocked
- **WHEN** a pull request adds a production dependency whose license is not on the allowlist
- **THEN** the license-scan job fails and the pull request shows a failing check

### Requirement: Local development database profile
The repository SHALL provide a Docker Compose development profile that starts a PostgreSQL instance
matching the version later persistence phases will target, without requiring any application
container to exist yet.

#### Scenario: Database starts standalone
- **WHEN** a developer runs `docker compose -f docker-compose.dev.yml up postgres`
- **THEN** a PostgreSQL instance becomes reachable on the documented local port

### Requirement: Dependencies are not constrained to dual-published packages
The toolchain SHALL be able to consume ESM-only packages, so dependency selection is decided on merit
rather than on module format.

#### Scenario: An ESM-only dependency is usable
- **WHEN** a workspace depends on a package published as ESM-only
- **AND** `yarn typecheck`, `yarn test`, and the workspace's runtime entrypoint are run
- **THEN** all succeed without a bundler, a transpilation shim, or a downgrade to an older major

#### Scenario: Runtime entrypoints boot under ESM
- **WHEN** the OpenAPI generator (which boots NestJS with the Fastify adapter) and `apps/migrate` are run
- **THEN** both execute successfully, proving decorators, dependency injection, and
  `reflect-metadata` work under the ES module system

### Requirement: End-to-end and deploy-verification jobs run only for release-candidate builds

The end-to-end browser test suite and the Docker build/deploy-verification chain (release image build,
deployment end-to-end, deploy smoke test) SHALL run only when the current CI run is a release
candidate — a pull request targeting `main`, a push to `main`, or a manually dispatched run — and SHALL
be skipped for a pull request targeting any other branch, so routine `develop`-targeting pull requests
get fast feedback without the cost of the full browser and deployment verification chain.

#### Scenario: A pull request against develop skips the end-to-end and deploy-verification jobs

- **WHEN** a pull request is opened targeting `develop`
- **THEN** the `e2e-tests`, `build`, `deployment-e2e`, and `deploy-smoke-test` jobs do not run, while
  lint, typecheck, unit tests, and integration tests still run

#### Scenario: A pull request against main runs the full verification chain

- **WHEN** a pull request is opened targeting `main`
- **THEN** the `e2e-tests`, `build`, `deployment-e2e`, and `deploy-smoke-test` jobs all run, subject to
  their own existing scope-based skip conditions (a frontend-only or backend-only change may still
  legitimately skip a subset, unrelated to the release-candidate gate)

#### Scenario: A manually dispatched run always includes the full verification chain

- **WHEN** the CI workflow is triggered manually (`workflow_dispatch`)
- **THEN** the end-to-end and deploy-verification jobs run regardless of branch

