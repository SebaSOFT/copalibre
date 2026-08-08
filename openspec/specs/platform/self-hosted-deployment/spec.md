# self-hosted-deployment Specification

## Purpose
Makes CopaLibre an installable, self-hostable product: one Docker image runs every process role, a
`copalibre` CLI operates it, and backups are provably restorable — realizing TMS-011 and product
invariant 5 (no mandatory hosted account).
## Requirements
### Requirement: Single multi-role image
The release SHALL ship one Docker image capable of running as any documented process role (`api`,
`events`, `worker`, `scheduler`, `migrate`, `doctor`), selected at container start without rebuilding
the image.

#### Scenario: Same image runs two different roles
- **WHEN** the image is started once with role `api` and again with role `worker`
- **THEN** each container serves only its role's behavior and both report their role via `/health`

### Requirement: Docker Compose Level 1 install
The repository SHALL provide a `docker-compose.yml` that starts a complete single-host CopaLibre
installation (all process roles, PostgreSQL, and optional Redis/object storage/SMTP) with one
command, and a separate dev profile with Compose Watch enabled.

#### Scenario: One-command install
- **WHEN** an operator with Docker installed runs the documented Compose-up command against a fresh
  host with no prior CopaLibre state
- **THEN** every process role becomes healthy and the control web UI becomes reachable without
  further manual steps

### Requirement: copalibre administrative CLI
The release SHALL provide a `copalibre` CLI with `init`, `doctor`, `dev`, `dev --hybrid`, `start`,
`migrate`, `create-admin`, `backup`, `restore`, and `upgrade-check` subcommands.

#### Scenario: doctor catches misconfiguration before start
- **WHEN** `copalibre doctor` runs against an installation missing a required secret or with an
  unreachable PostgreSQL host
- **THEN** it reports the specific missing/unreachable dependency and exits non-zero without starting
  any process role

#### Scenario: create-admin bootstraps access
- **WHEN** `copalibre create-admin` is run against a fresh installation with no existing users
- **THEN** it creates exactly one administrator account and prints the credentials or setup link once

#### Scenario: doctor validates JWKS URI content, not only resolvability
- **WHEN** `copalibre doctor` runs against an installation whose configured JWKS URI is
  DNS-resolvable and reachable but does not serve a valid JWKS document (a JSON object with a
  `keys` array)
- **THEN** it reports the JWKS URI as misconfigured, naming the URL, and exits non-zero without
  starting any process role

### Requirement: Module management subcommands
The `copalibre` CLI SHALL provide `module add`, `module list`, `module remove` and `module verify`.

#### Scenario: An operator lists installed modules
- **WHEN** the module-list command is run
- **THEN** each installed module's kind, version, attribution, source and satisfied-capability state
  is shown

#### Scenario: Adding a module takes a name, not a URL
- **WHEN** an operator runs the module-add command
- **THEN** its argument is a module alias with an optional version range, and no location is required
  for a module published in the curated repository

#### Scenario: Removing a module in use is refused
- **WHEN** an operator removes a module a started tournament references
- **THEN** the removal is refused, naming the tournaments that reference it

### Requirement: Verified backup and restore
A backup produced by `copalibre backup` SHALL restore into a clean installation via `copalibre
restore` and pass an automated integrity check.

#### Scenario: Restore into a clean install recovers all authoritative data
- **WHEN** a backup is taken, a new clean installation is created, and `copalibre restore` is run
  against that backup
- **THEN** the restored installation's tournament, participant, result, and audit data matches the
  source installation at backup time, and the integrity check reports no discrepancy

### Requirement: Reverse-proxy conformance
The release SHALL document and test at least one reverse-proxy configuration (Caddy or NGINX)
preserving original scheme/host/client-address forwarding, disabling buffering/caching on SSE routes,
providing sufficiently long idle timeouts with heartbeat support, and restricting trusted client-IP
resolution to an explicit, operator-scoped allowlist of proxy addresses.

#### Scenario: Proxy conformance test detects SSE buffering
- **WHEN** the conformance test suite runs against a reverse-proxy configuration that buffers
  responses on an SSE route
- **THEN** the test fails and identifies the buffering misconfiguration

#### Scenario: Example configs restrict trusted client-IP resolution
- **WHEN** an operator reviews the provided Caddy or NGINX example configuration
- **THEN** it contains an explicit trusted-proxy allowlist directive (not a default that trusts
  every upstream) and documentation directing the operator to scope it to their actual proxy
  network

### Requirement: Continuous integration builds and smoke-tests the release image
The CI pipeline SHALL build the release Docker image and start a full Compose profile as an
automated `deploy-smoke-test` job that probes every process role's health endpoint before a pull
request can merge.

#### Scenario: A broken image fails the pipeline before merge
- **WHEN** a pull request introduces a change that prevents one process role's container from
  reaching a healthy state under Compose
- **THEN** the `deploy-smoke-test` CI job fails and the pull request shows a failing check

