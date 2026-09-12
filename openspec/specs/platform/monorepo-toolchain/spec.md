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

### Requirement: Remediate known transitive dependency security advisories
The toolchain SHALL enforce explicit package resolutions, direct dependency constraints, and lockfile pinning to remediate known high-, medium-, and low-severity security advisories across all production, development, and transitive dependencies whenever upstream fixes are available.

The repository SHALL remediate known unmitigated Dependabot alerts with available compatible patches and track GitHub closure separately until the fix reaches the default branch. Transitive packages requiring fixed versions SHALL be pinned in the root `package.json` resolutions map. When no upstream patch is available, the repository SHALL remove the vulnerable package from the affected execution path or prevent its vulnerable behavior with a tested safe boundary.

#### Scenario: Transitive fast-uri instances resolve to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** both direct and transitive instances of `fast-uri` resolve to version `3.1.6` or greater (for the v3 line) and `4.1.3` or greater (for the v4 line), remediating CVE-2026-75931, CVE-2026-75899, CVE-2026-76172, and CVE-2026-75975

#### Scenario: Transitive qs instances resolve to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** all transitive instances of `qs` resolve to version `6.16.0` or greater, remediating CVE-2026-82562 and CVE-2026-82417

#### Scenario: Transitive ai-sdk provider utils resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** transitive instances of `@ai-sdk/provider-utils` resolve to version `4.0.33` or greater, remediating CVE-2026-8769

#### Scenario: Monorepo test and verification gates remain green under patched dependencies
- **WHEN** the monorepo test gate (`yarn test`, `yarn test:integration`, `yarn workspace @copalibre/web verify:docs`) is executed
- **THEN** all test suites pass without regression under the upgraded dependency versions

#### Scenario: Transitive SVG optimizer resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** v4 instances of `svgo` resolve to version `4.1.0` or greater, remediating GHSA-w27v-7q3p-w38r and GHSA-4vpr-x523-8j87

#### Scenario: Direct mail delivery dependency resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** the worker's Nodemailer instance resolves to version `9.1.1` or greater, remediating GHSA-8m3c-c648-2xjj, GHSA-2x7j-588g-ccc2, GHSA-wmmp-3585-3rmp, and GHSA-cc9r-2j5m-2m83

#### Scenario: Public and help build dependency resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** the web workspace's Astro instance resolves to version `7.2.8` or greater, remediating GHSA-376h-93r7-7g6f and GHSA-26w7-cxv4-gfx2

#### Scenario: Transitive HTTP framework resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** every locked Hono instance resolves to version `4.13.5` or greater, remediating GHSA-crvj-82cr-hjcx, GHSA-g6gw-c38x-mqfc, and GHSA-gqvv-2mrq-wpjv

#### Scenario: Windows binary archive extraction rejects unsafe entries
- **WHEN** the CLI binary build processes a ZIP archive containing a symbolic link or an entry whose destination is outside its extraction directory
- **THEN** extraction fails before writing that entry and does not create or modify a path outside the intended directory

#### Scenario: A vulnerable duplicate fails CI
- **WHEN** any affected lockfile entry or resolution falls below its supported major line’s patched floor
- **THEN** the CI install check fails, even if another instance of that package is patched

#### Scenario: Closure follows release rather than manual dismissal
- **WHEN** remediation is merged to the integration branch while the default branch still has vulnerable versions
- **THEN** release tracking identifies the patched versions and pending default-branch closure, without claiming GitHub alerts are already fixed

### Requirement: Conditional verification accounts for affected consumers

Verification selection SHALL preserve the repository's existing safe frontend, backend, CLI, and documentation scope exclusions while including every affected transitive workspace consumer. Unknown scope or a global dependency/configuration change SHALL select the conservative broader verification set. Selected and excluded checks SHALL have inspectable reasons. Existing mandatory lint, typecheck, license, security, and unit-coverage obligations SHALL remain required.

#### Scenario: Shared domain changes select web verification
- **WHEN** a shared domain change affects a web consumer
- **THEN** web verification is selected as well as affected backend verification, and the change is not treated as backend-only

#### Scenario: Root dependencies cannot suppress consumer checks
- **WHEN** the root manifest, lockfile, package-manager configuration, or shared verification configuration changes
- **THEN** all potentially affected verification surfaces are selected regardless of whether application source changed

#### Scenario: Existing safe skips remain effective
- **WHEN** a change is confined to an independently classified API, frontend, CLI, or documentation area
- **THEN** its existing safe exclusions remain effective and parallel groups are created only for selected checks

#### Scenario: Deleted or ambiguous ownership is conservative
- **WHEN** a changed, renamed, or deleted path cannot be mapped to a reliable consumer set
- **THEN** the plan selects the broader applicable verification set and records the fallback reason

### Requirement: Scope selection does not change release eligibility

Scope and release eligibility SHALL remain independent. Browser end-to-end and image/deployment verification SHALL retain the existing release-candidate policy: eligible on pull requests targeting main, pushes to main, and manual dispatch, subject to applicable scope conditions. A develop-targeting pull request SHALL NOT activate those release-only jobs merely because its selected scope is broad. Manual dispatch and pushes to main SHALL retain full verification scope.

#### Scenario: Workflow changes on develop remain non-release
- **WHEN** a pull request targeting develop changes workflow or dependency configuration
- **THEN** scope is conservative but browser and deployment release-only jobs remain skipped

#### Scenario: Eligible release executes selected shards
- **WHEN** a release-candidate change requires web verification
- **THEN** every planned browser shard executes and the release gate requires their successful aggregate outcome

#### Scenario: Manual runs do not inherit a narrow path selection
- **WHEN** CI is manually dispatched on any branch
- **THEN** full verification scope including release verification is selected

### Requirement: Verification partitions preserve test and mode coverage

An optimized verification plan SHALL cover the same required tests, assertions, execution modes, and workspace coverage thresholds as the unpartitioned plan. A redundant invocation SHALL be removed only when another owning suite covers its tests under equivalent conditions. Discovery and execution reports SHALL identify missing tests, workspaces, and required partitions as failures. Distinct database dialects and specialized smoke/soak/security checks SHALL retain their separate obligations.

#### Scenario: Focused rerun is already covered
- **WHEN** a focused invocation discovers only tests already executed by its owning full suite with equivalent configuration and environment
- **THEN** those tests execute once in that mode and remain identifiable in reports

#### Scenario: PostgreSQL and SQLite are distinct obligations
- **WHEN** the same test is required against two database dialects
- **THEN** both modes remain in the plan and neither is removed as a duplicate

#### Scenario: Workspace coverage fails in a parallel group
- **WHEN** a workspace misses any existing coverage threshold within a parallel group
- **THEN** the aggregate required check fails even if every test assertion passes elsewhere

#### Scenario: A partition is omitted
- **WHEN** the planned partitions omit a required test or workspace or an expected suite unexpectedly discovers no tests
- **THEN** plan validation fails rather than reporting reduced execution as a successful optimization

### Requirement: Parallel checks have bounded and isolated resources

Verification execution SHALL declare limits on concurrent groups and workers per group. Concurrent stateful test groups SHALL own independent service/data namespaces and output paths. A shared preview server, fixture port, or mutable build directory SHALL have exclusive ownership for the duration of its use. Contributor instructions SHALL describe a bounded local schedule with the same resource constraints.

#### Scenario: Browser shards execute concurrently
- **WHEN** two browser shards run at the same time
- **THEN** each owns independent preview/API resources and one shard's fixture teardown cannot affect the other

#### Scenario: Integration groups use real services
- **WHEN** integration groups execute concurrently
- **THEN** each group's required PostgreSQL and storage/scanner services are isolated and readiness is verified before its tests start

#### Scenario: Local browser verification owns its build output
- **WHEN** a local preview is serving built web output to browser tests
- **THEN** the documented gate schedule prevents another command from rebuilding that same output until preview verification completes

### Requirement: Shared build artifacts are current and validated

Checks requiring identical web build inputs SHALL consume a single produced artifact for that workflow run, commit, and build configuration. Every existing public/help output assertion SHALL remain enforced. An absent or mismatched artifact SHALL fail its consumer. Standalone local verification SHALL continue to produce required output from current sources without depending on prior CI artifacts.

#### Scenario: Public and help checks share a build
- **WHEN** public and help verification select the same build configuration
- **THEN** both inspect the same current artifact and each retains its existing assertions without a second build

#### Scenario: A release shard receives stale output
- **WHEN** a browser shard's artifact does not match the current run, commit, or required configuration
- **THEN** the shard fails before treating tests against that output as valid

#### Scenario: Local docs verification starts without output
- **WHEN** a developer invokes the standalone docs verification command in a clean checkout
- **THEN** it builds current prerequisites and verifies the resulting documentation, including API-reference operation without a live API

### Requirement: Aggregate checks preserve failure and skip authority

Parallel verification SHALL retain stable required aggregate check identities. An aggregate SHALL pass only when every check required by its plan passes; an intentionally excluded group SHALL be distinguishable from a missing, failed, or cancelled required group. Release build and deployment conditions SHALL continue to prevent propagation after required verification fails or is cancelled.

#### Scenario: Required child fails while another is skipped
- **WHEN** a selected child fails and an unrelated group is intentionally excluded
- **THEN** the aggregate fails and downstream release verification does not treat the skip as success for the failed child

#### Scenario: Required child is cancelled or absent
- **WHEN** a required child is cancelled or never reports an outcome
- **THEN** the aggregate cannot report success

#### Scenario: A family is intentionally excluded
- **WHEN** scope or release policy excludes an entire check family
- **THEN** its outcome records that intentional exclusion without hiding a failure in any other required family

### Requirement: Resource improvements are measured against equivalent verification

Optimization evidence SHALL report elapsed time and total job execution time separately, with runner class, queue delay, cache state, test/mode inventory, coverage outcomes, and concurrency settings. Comparisons SHALL use equivalent required verification sets and repeated baseline/candidate runs. Selected tuning SHALL reduce median elapsed time without increasing median total job time for the measured equivalent workloads. Correcting a previously unsafe skip SHALL be reported as added required verification, not as an optimization regression or a reason to omit tests.

#### Scenario: Parallelism is faster but consumes more total job time
- **WHEN** a candidate parallel configuration improves elapsed time but increases median total job time for equivalent verification
- **THEN** concurrency or setup duplication is reduced before that configuration is accepted

#### Scenario: A previously skipped shared consumer is now checked
- **WHEN** classification correction adds a required consumer check absent from the old workflow
- **THEN** the comparison identifies that scope correction and uses a baseline containing the same check set

#### Scenario: Cache state differs between measurements
- **WHEN** one run restores caches and another starts without them
- **THEN** the evidence identifies the differing cache states rather than attributing the entire timing difference to scheduling

### Requirement: Change-risk (CRAP) score reporting

The repository SHALL compute a change-risk (CRAP) score for every function in every workspace with
Jest coverage enabled, combining that function's cyclomatic complexity with its line/branch coverage
as `CRAP(m) = complexity(m)^2 * (1 - coverage(m))^3 + complexity(m)`. A function whose score exceeds
30 and is not present in a ratcheting debt register SHALL fail the `unit-tests-group` CI job. A function
already present in the debt register SHALL fail the job if its recorded score increases, so existing
debt can only shrink or hold steady, never grow. A workspace with no coverage output yet SHALL be
skipped with a warning rather than failed.

#### Scenario: A new high-risk function fails CI
- **WHEN** a pull request adds a function with cyclomatic complexity of 8 and 0% line coverage
- **AND** that function is not present in the debt register
- **THEN** the `unit-tests-group` job fails, reporting the function's name, file, complexity, coverage,
  and computed CRAP score

#### Scenario: A grandfathered function does not regress
- **WHEN** a pull request modifies a function already present in the debt register
- **AND** its recomputed CRAP score is lower than or equal to the register's recorded value
- **THEN** the `unit-tests-group` job does not fail for that function

#### Scenario: A grandfathered function gets worse
- **WHEN** a pull request modifies a function already present in the debt register
- **AND** its recomputed CRAP score is higher than the register's recorded value
- **THEN** the `unit-tests-group` job fails, reporting the prior and new scores

#### Scenario: Coverage-free workspace is skipped, not failed
- **WHEN** the CRAP check runs against a workspace that has not yet produced an Istanbul
  coverage-final.json
- **THEN** the check reports a warning for that workspace and exits zero for it, without failing the
  `unit-tests-group` job

#### Scenario: Local pre-push check available
- **WHEN** a developer runs `yarn crap:check` locally after `yarn workspace @copalibre/<workspace>
  test:coverage`
- **THEN** the same score computation, threshold, and debt-register enforcement run locally as in CI
