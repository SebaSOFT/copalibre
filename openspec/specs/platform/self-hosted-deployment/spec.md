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
`migrate`, `create-admin`, `backup`, `restore`, `upgrade-check`, and `mcp` subcommands. Every
invocation SHALL print a startup banner identifying the product, its version, and its license before
running the requested subcommand, and that banner SHALL be written to a stream that never mixes with a
subcommand's own stdout output. Running `copalibre --help`/`-h` with no subcommand SHALL list every
subcommand with a one-line summary, and running `copalibre <subcommand> --help`/`-h` SHALL print
that subcommand's usage line, a description of what it does, and its flags — for every documented
subcommand, sourced from one place so the top-level summary and each subcommand's detail cannot
drift apart. `upgrade-check` SHALL evaluate a given target CopaLibre version against every installed
module's declared compatibility range and report pending database migrations, exiting non-zero if
any installed module would become incompatible with the target version.

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

#### Scenario: Every invocation discloses version and license
- **WHEN** any `copalibre` subcommand is run, including `--help`/`-h` and an unknown command
- **THEN** the CLI prints a startup banner naming the product, the version it is currently
  distributed at, and its license, before any of the subcommand's own output

#### Scenario: The banner never pollutes piped stdout
- **WHEN** `copalibre`'s stdout is piped or redirected to another program or file (e.g.
  `copalibre doctor | grep FAIL`)
- **THEN** the piped/redirected stream contains only the subcommand's own output — the startup
  banner appears on stderr, not stdout

#### Scenario: Top-level help lists every subcommand
- **WHEN** an operator runs `copalibre --help`, `copalibre -h`, or `copalibre` with no arguments
- **THEN** the output lists every documented subcommand with a one-line summary of what it does, and
  names `copalibre <subcommand> --help` as the way to see more

#### Scenario: A subcommand's own help never runs the subcommand
- **WHEN** an operator runs `copalibre <subcommand> --help` or `copalibre <subcommand> -h` for any
  documented subcommand
- **THEN** the CLI prints that subcommand's usage line, description, and flags, and exits 0 without
  performing any of the subcommand's real effects (no database connection opened, no process
  started, no file written)

#### Scenario: upgrade-check refuses an incompatible target version
- **WHEN** an operator runs `copalibre upgrade-check --target-version <version>` and an installed
  module's declared `requiresCopalibre` range does not include `<version>`
- **THEN** it names the incompatible module, its declared range, and the target version, and exits
  non-zero without altering any installed data

#### Scenario: upgrade-check reports pending migrations
- **WHEN** an operator runs `copalibre upgrade-check` against an installation with unapplied
  database migrations
- **THEN** it lists the pending migration names, without applying any of them

#### Scenario: upgrade-check passes when every module is compatible
- **WHEN** every installed module's declared `requiresCopalibre` range includes the given target
  version
- **THEN** `copalibre upgrade-check --target-version <version>` exits 0

### Requirement: Module management subcommands
The `copalibre` CLI SHALL provide `module add`, `module list`, `module remove` and `module verify`.
Running `copalibre module --help`/`-h` SHALL list these four subcommands with a one-line summary
each, and running `copalibre module <subcommand> --help`/`-h` SHALL print that subcommand's usage
line, description, and flags, following the same one-source-of-truth rule as the top-level CLI's
help.

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

#### Scenario: module --help lists its subcommands
- **WHEN** an operator runs `copalibre module --help` or `copalibre module` with no further
  arguments
- **THEN** the output lists `add`, `list`, `remove`, and `verify` with a one-line summary of each

### Requirement: Verified backup and restore

`copalibre backup` SHALL produce a compressed packet under `backups/` containing the database dump
and a manifest recording the backup timestamp and the CopaLibre version that produced it, restorable
into a clean installation via `copalibre restore` and passing an automated integrity check.
`copalibre backup` SHALL retain no more than a configurable number of packets (`--retain`, default
5), deleting the oldest beyond that count after each successful backup, and SHALL only ever delete
files matching its own packet naming pattern. `copalibre restore` SHALL refuse to restore a packet
whose recorded CopaLibre version is newer than the running installation's version unless explicitly
overridden, SHALL run pending database migrations against the restored data automatically after a
successful restore, and SHALL confirm that the resulting schema matches what the running
installation expects before reporting success.

#### Scenario: Restore into a clean install recovers all authoritative data

- **WHEN** a backup is taken, a new clean installation is created, and `copalibre restore` is run
  against that backup
- **THEN** the restored installation's tournament, participant, result, and audit data matches the
  source installation at backup time, and the integrity check reports no discrepancy

#### Scenario: Old packets are pruned beyond the retention count

- **WHEN** `copalibre backup` succeeds and more than `--retain` packets (or the default of 5) exist
  under `backups/`
- **THEN** the oldest packets beyond that count are deleted, and every file in `backups/` that does
  not match the packet naming pattern is left untouched

#### Scenario: A backup packet is self-describing

- **WHEN** an operator inspects a packet `copalibre backup` produced
- **THEN** it contains a manifest recording when the backup was taken and which CopaLibre version
  produced it, alongside the compressed database dump

#### Scenario: A backup newer than the running installation is refused by default

- **WHEN** an operator runs `copalibre restore` against a packet whose recorded CopaLibre version is
  newer than the version currently running, without `--allow-newer-backup`
- **THEN** the restore is refused, naming both the backup's version and the running version, and no
  data is restored

#### Scenario: An older or same-version backup restores and migrates automatically

- **WHEN** an operator restores a packet whose recorded CopaLibre version is the same as or older
  than the running installation
- **THEN** the restore proceeds, and pending database migrations run automatically against the
  restored data immediately afterward, with no separate manual step required

#### Scenario: Restore confirms the schema matches before reporting success

- **WHEN** a restore and its automatic migration both complete
- **THEN** `copalibre restore` checks that the applied schema matches what the running installation
  expects and reports that confirmation, or reports a clear failure naming what to run next if it
  does not match

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

