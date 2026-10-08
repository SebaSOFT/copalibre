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
- **THEN** both direct and transitive instances of `fast-uri` resolve to version `3.1.8` or greater (for the v3 line) and `4.2.1` or greater (for the v4 line), remediating authority injection and host confusion vulnerabilities (CVE-2026-75975, GHSA-f65p-4m7j-42xc)

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
- **THEN** the worker's Nodemailer instance resolves to version `10.0.2` or greater, remediating TLS servername DNS cache disclosure across transports

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

#### Scenario: Transitive ip-address dependency resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** all locked instances of `ip-address` resolve to version `10.5.1` or greater, remediating link-local and NAT64 classification SSRF bypasses

#### Scenario: Web undici dependency resolves to patched release
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** all locked `undici` 8.x instances used by `apps/web`, including transitive instances, resolve to version `8.10.2` or greater, remediating WebSocket permessage-deflate decompression DoS

#### Scenario: Every locked undici major line meets its patched floor
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** every locked `undici` 6.x instance resolves to version `6.28.1` or greater, including the Node tooling dependency path whose Dependabot alert was auto-dismissed

#### Scenario: Open Dependabot PR dependency updates typecheck
- **WHEN** the branch includes Jest `30.5.2` and `react-intl` `12.1.3`
- **AND** the monorepo typecheck runs
- **THEN** Jest fetch mocks and descriptor-based message catalogs typecheck without weakening runtime behavior

#### Scenario: Dependabot PR audit coverage is explicit
- **WHEN** the change's dependency audit is reviewed against its base branch
- **THEN** every open Dependabot PR is implemented in this change or already present in `develop`
- **AND** every active alert and every auto-dismissed alert with a vulnerable lock entry is checked against a patched floor

### Requirement: Node 26 runtime and container bootstrap
The toolchain and container images SHALL target Node 26 as the active supported runtime. Because Node 26 removes Corepack from the core distribution, container build stages SHALL explicitly install Corepack globally before invoking Yarn commands.

#### Scenario: Engine enforcement accepts Node 26
- **WHEN** `node -v` reports a Node.js 26.x release
- **AND** `yarn install --immutable` or `yarn typecheck` is run
- **THEN** the root `package.json` engine constraint does not error or reject the runtime

#### Scenario: Container image builds succeed on Node 26
- **WHEN** the production Docker image is built using `node:26-bookworm-slim`
- **THEN** the build stage installs Corepack via npm before `corepack enable`
- **AND** the compilation, type-check, and web build finish cleanly

#### Scenario: QEMU GitHub Action is unified to v4
- **WHEN** release and verification workflows invoke `docker/setup-qemu-action`
- **THEN** all workflows use `@v4` consistently

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

### Requirement: Change-risk (CRAP) score report visibility

The repository SHALL render every function's computed change-risk (CRAP) score (per the "Change-risk
(CRAP) score reporting" requirement's formula and coverage source) as a repo-wide, top-N-by-score
markdown table in the CI run's GitHub Actions Job Summary, regardless of whether the gate itself
passes or fails. The complete, unabridged per-function list SHALL be available as a downloadable JSON
build artifact for the same run. Rendering the report SHALL NOT alter the gate's pass/fail outcome,
its exit code, or its debt register.

#### Scenario: Report renders on a passing run
- **WHEN** a pull request's `unit-tests-group` job runs with no CRAP offenders
- **THEN** the run's Job Summary still shows the top-N highest-scoring functions across every scanned
  workspace, and a JSON artifact with the complete per-function list is attached to the run

#### Scenario: Report renders on a failing run
- **WHEN** a pull request's `unit-tests-group` job fails because a function exceeds the CRAP
  threshold or a grandfathered function regressed
- **THEN** the run's Job Summary still shows the top-N highest-scoring functions, including the
  function(s) that failed the gate, and the job's exit code is unchanged by the report step

#### Scenario: Report spans both matrix legs
- **WHEN** `unit-tests-group` runs its two matrix legs, each covering a disjoint set of workspaces
- **THEN** the Job Summary's top-N table is computed over the union of both legs' scored functions,
  not just one leg's

#### Scenario: A workspace with no coverage output is absent from the report, not reported as zero risk
- **WHEN** a workspace has not yet produced an Istanbul `coverage-final.json` for this run
- **THEN** that workspace contributes no entries to the report, consistent with the existing gate's
  skip-with-warning behavior for the same condition

### Requirement: Patched floors cover newly identified transitive advisories
The toolchain SHALL pin supported stable major lines of packages with known advisories to patched versions, and its dependency security guard SHALL fail when any locked instance falls below its patched floor or introduces an unreviewed major line.

#### Scenario: Locked brace-expansion instances meet patched floors
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** every locked `brace-expansion` 1.x instance resolves to `1.1.18` or greater, every 2.x instance resolves to `2.1.4` or greater, and every 5.x instance resolves to `5.0.9` or greater

#### Scenario: The pinned js-yaml 4.x instance is patched
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** the locked `js-yaml` instance selected by the exact `4.2.0` descriptor resolves to `4.3.2` or greater

#### Scenario: Locked nanoid 3.x instances meet the patched floor
- **WHEN** dependencies are installed via `yarn install --immutable`
- **THEN** every locked `nanoid` 3.x instance resolves to `3.3.18` or greater

#### Scenario: A vulnerable duplicate or unreviewed major fails the dependency guard
- **WHEN** a supported package has any locked instance below its patched floor or a locked instance on a major line without a declared floor
- **THEN** the dependency security guard fails and identifies the package and locked descriptor

### Requirement: Continuous integration audits the full dependency graph
Continuous integration SHALL check direct and transitive dependencies from every workspace against package registry security advisories and the GitHub Advisory Database. Any open, unreviewed security advisory SHALL fail the check, while package deprecation notices alone SHALL NOT count as security advisories. Transitive build-time dependencies without upstream patches SHALL require explicit documented architectural blast-radius assessment before release.

#### Scenario: Pull request dependency graph has no security advisories
- **WHEN** CI installs dependencies for a pull request
- **THEN** it audits every workspace's direct and transitive dependencies, including development dependencies, and the check passes only when no security advisories are reported

#### Scenario: A newly disclosed advisory blocks CI
- **WHEN** the current registry reports a security advisory for any locked direct or transitive dependency
- **THEN** CI fails the dependency audit check, even if the advisory was not present when the branch was created

#### Scenario: An advisory in a package without a manual floor blocks CI
- **WHEN** the current registry reports a security advisory for a package that has no entry in the dependency security guard's patched-floor table
- **THEN** the all-workspace dependency audit still fails CI for that package

#### Scenario: Deprecation notices do not fail the vulnerability gate
- **WHEN** the registry reports only package deprecation notices and no security advisories
- **THEN** the dependency audit check passes

#### Scenario: Supply-chain audit detects GitHub security advisories
- **WHEN** CI runs security verification on a pull request
- **THEN** it audits the dependency graph against open repository advisories and fails if an unreviewed advisory exists

#### Scenario: Unpatched build-time dependencies require recorded blast-radius assessment
- **WHEN** a transitive dependency carries an open advisory with no upstream patch available
- **THEN** CI requires an explicit entry in the verified unpatched register documenting zero runtime exposure, failing if the advisory is unreviewed or if an upstream patch has been released but not adopted

### Requirement: Transitive security remediations are attributed to direct dependencies
The repository SHALL maintain a versioned, machine-readable register of confirmed security remediation events caused by vulnerable transitive dependencies. Each event SHALL identify the advisory, affected transitive package, remediation action, and all direct dependency package roots that lead to the affected package, with the consuming workspaces and evidence needed to verify those paths. A single event SHALL count once for each distinct direct dependency root, regardless of how many workspaces consume that root or how many duplicate paths occur beneath it. CI SHALL validate the register and publish cumulative event, advisory, and transitive-package counts grouped by direct dependency root. The report SHALL identify the historical coverage window and mark an incomplete baseline as partial; missing historical entries SHALL NOT be presented as zero incidents. This report SHALL inform maintainer decisions and SHALL NOT automatically replace dependencies or weaken the dependency audit gate.

#### Scenario: One advisory remediation is counted once per direct root
- **WHEN** one transitive advisory affects the same direct dependency package in multiple workspaces and through duplicate nested paths
- **THEN** the report counts one event for that direct dependency package and lists all affected workspaces

#### Scenario: One advisory remediation is attributed to multiple direct roots
- **WHEN** two distinct direct dependency packages introduce the same vulnerable transitive package
- **THEN** the report attributes one event to each direct dependency package and links both attributions to the same remediation evidence

#### Scenario: A new transitive remediation updates the lifetime counts
- **WHEN** maintainers add a verified remediation event to the register
- **THEN** CI validates its advisory, transitive package, remediation, direct roots, affected workspaces, and evidence, then includes it in grouped counts

#### Scenario: Incomplete historical coverage is visible
- **WHEN** the register includes only remediations that can be confirmed from repository evidence
- **THEN** the report identifies its coverage start and marks the historical baseline partial rather than treating earlier omissions as zero incidents

#### Scenario: Security incident reporting preserves the audit gate
- **WHEN** the report is generated for a CI run
- **THEN** it does not change dependency audit results or automatically modify dependency manifests, resolutions, or lockfiles

### Requirement: Tracked Content Carries No Change-Number Citation
Tracked file content and tracked file names SHALL NOT cite an OpenSpec change by number or by its numbered directory name, because change directories are git-ignored and exist only on the machine that created them. Comments, docstrings, test and story names, workflow and script comments, documentation prose, configuration reasons and accepted specs SHALL describe the behavior or rationale in words. Continuous integration SHALL fail when tracked content or a tracked file name contains such a citation. The generated release history, database migration files and their sequence numbers, and lockfiles SHALL be exempt. Four-digit values that are not citations (ports, years, fixtures, version strings) SHALL NOT be reported.

#### Scenario: A comment cites a change by number
- **WHEN** a tracked source file contains a citation: the word "openspec" or "change" followed by a four-digit change number, a parenthesised four-digit number, or a four-digit number followed by a kebab-case change name
- **THEN** the change-number guard fails continuous integration and reports the file and line

#### Scenario: A tracked file name starts with a change number
- **WHEN** a tracked file outside the migrations directory has a basename starting with a four-digit change number followed by a hyphen
- **THEN** the guard fails and reports the file path

#### Scenario: Non-citation four-digit values are not reported
- **WHEN** tracked content contains a port number, a year, a migration sequence number or a fixture literal
- **THEN** the guard reports nothing for it

#### Scenario: Exempt files may keep historical numbers
- **WHEN** `CHANGELOG.md`, a migration file or a lockfile contains a change number
- **THEN** the guard does not fail

### Requirement: Tracked Content Does Not Cite A Change's Planning Artifacts
Tracked file content SHALL NOT point at a git-ignored change's planning artifacts as the source of a rationale: a task number such as "task" followed by a dotted number, or the file names of a change's design, tasks or proposal documents used as a reference. The rationale SHALL be stated in words where it is needed. Continuous integration SHALL fail when tracked content contains such a reference. Documentation that describes the OpenSpec workflow itself, and the guard's own test fixtures, SHALL be exempt through an explicit short allowlist.

#### Scenario: A comment points at a design document
- **WHEN** a tracked source file says a behavior is explained in a change's design document
- **THEN** the guard fails continuous integration and reports the file and line

#### Scenario: A comment cites a task number
- **WHEN** a tracked source file cites "task" followed by a dotted number
- **THEN** the guard fails continuous integration and reports the file and line

#### Scenario: Workflow documentation may name the files
- **WHEN** `AGENTS.md` or a skill describes what a change's design or tasks document is for
- **THEN** the guard does not fail
