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
the layout in `copalibre-platform-architecture.md`.

#### Scenario: Fresh clone installs cleanly
- **WHEN** a developer clones the repository and runs `yarn install --immutable`
- **THEN** installation succeeds with no lockfile drift and no Plug'n'Play artifacts are created

#### Scenario: Every declared app and package resolves
- **WHEN** `yarn workspaces list` is run
- **THEN** it lists every `apps/*` and `packages/*` workspace declared above, each with a valid `package.json`

### Requirement: TypeScript project references
Every `apps/*` and `packages/*` workspace SHALL be wired into a root TypeScript project-reference
graph so a change in a `packages/*` source file is picked up by `apps/*` type-checking without a
publish step.

#### Scenario: Cross-package type change is caught
- **WHEN** a type exported from `packages/domain` is changed incompatibly
- **AND** `yarn typecheck` is run at the repo root
- **THEN** type-checking fails in any `apps/*` workspace that consumes the changed type

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
workspace, and a root Playwright configuration targeting `apps/web`, even before any test files
exist.

#### Scenario: Empty test suite does not fail CI
- **WHEN** `yarn test` is run against the scaffolded repository with no test files yet written
- **THEN** the command reports zero tests found and exits zero (not an error)

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

