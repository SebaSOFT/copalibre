# self-hosted-deployment Specification

## Purpose
Makes CopaLibre an installable, self-hostable product: one Docker image runs every process role, a
`copalibre` CLI operates it, and backups are provably restorable — realizing TMS-011 and product
invariant 5 (no mandatory hosted account).
## Requirements
### Requirement: Single multi-role image
The release SHALL ship one Docker image capable of running as any documented process role (`api`,
`events`, `worker`, `scheduler`, `migrate`, `doctor`, `web`), selected at container start without
rebuilding the image. The `web` role SHALL serve server-rendered public pages for the subset of public
routes that require per-request backend data; it SHALL NOT replace the existing static delivery of
every other public, control-panel-shell, help, and TV route, which continues to be served as static
files by a separate process in front of it.

#### Scenario: Same image runs two different roles
- **WHEN** the image is started once with role `api` and again with role `worker`
- **THEN** each container serves only its role's behavior and both report their role via `/health`

#### Scenario: The web role serves only its designated dynamic routes
- **WHEN** the image is started with role `web`
- **THEN** it serves server-rendered responses for the tournament overview, live dashboard, and stage
  bracket routes (and their locale-prefixed variants), and nothing else is expected to reach it
  directly — every other public/control/help/TV route is served by the existing static file server

### Requirement: Docker Compose Level 1 install
The repository SHALL provide a `docker-compose.yml` that starts a complete single-host CopaLibre
installation (all process roles, PostgreSQL, and optional Redis/object storage/SMTP) with one
command, and a separate dev profile with Compose Watch enabled. The internal web reverse proxy SHALL
route the tournament overview, live dashboard, and stage bracket URL shapes (and their locale-prefixed
variants) to the `web` role's server-rendered responses, and SHALL serve every other route as a static
file, unchanged.

#### Scenario: One-command install
- **WHEN** an operator with Docker installed runs the documented Compose-up command against a fresh
  host with no prior CopaLibre state
- **THEN** every process role becomes healthy and the control web UI becomes reachable without
  further manual steps

#### Scenario: A dynamic public route is served by the web role, everything else stays static
- **WHEN** the Compose install is running and an anonymous visitor requests a tournament overview page
- **THEN** the internal web reverse proxy forwards that request to the `web` role's server process
- **WHEN** the same visitor requests a static public page, the control-panel shell, a help page, or a
  TV page
- **THEN** the internal web reverse proxy serves it directly from the static build output, without
  involving the `web` role's server process

### Requirement: copalibre administrative CLI
The release SHALL provide a `copalibre` CLI with `init`, `doctor`, `dev`, `dev --hybrid`, `start`,
`migrate`, `create-admin`, `login`, `statistics-rebuild`, `backup`, `restore`, `upgrade-check`, and
`mcp` subcommands, distributed both as a standalone executable (downloadable via a documented install
script, one per supported OS/architecture) and as source runnable from a checkout — the two SHALL
behave identically for every subcommand. Every invocation SHALL print a startup banner identifying the product, its version, and
its license before running the requested subcommand, and that banner SHALL be written to a stream that
never mixes with a subcommand's own stdout output. Running `copalibre --help`/`-h` with no subcommand
SHALL list every subcommand with a one-line summary, and running `copalibre <subcommand> --help`/`-h`
SHALL print that subcommand's usage line, a description of what it does, and its flags — for every
documented subcommand, sourced from one place so the top-level summary and each subcommand's detail
cannot drift apart. `upgrade-check` SHALL evaluate a given target CopaLibre version against every
installed module's declared compatibility range and report pending database migrations, exiting
non-zero if any installed module would become incompatible with the target version.

`copalibre init`, run in a directory with no prior CopaLibre installation, SHALL write a complete,
runnable installation (a Compose file and its environment defaults) into that directory without
requiring a checkout of this repository's source, and SHALL record the CopaLibre version and an
installation identifier in that directory so later commands run from it identify the installation
automatically. A directory already containing an installation SHALL cause `init` to refuse rather than
overwrite any part of it. `doctor`, `start`, `migrate`, and `upgrade-check`, when run from a
directory containing a recorded installation, SHALL operate against that directory's own files without
requiring a checkout; version-sensitive subcommands (`init` re-run, `migrate`, `upgrade-check`) SHALL
refuse with a message naming both versions when the running CLI's own version does not match the
directory's recorded version. `init --module-dev` SHALL additionally write a companion Compose
override file bind-mounting a local module-development directory into the installation, with no
extra flag needed at the operator's own `docker compose` invocation.

`copalibre login` SHALL accept a personal access token (via flag, stdin, or an interactive prompt),
validate it against the target installation, and store it so subsequent `statistics-rebuild` and
`module` subcommands authenticate over the network. `statistics-rebuild`, when a stored credential
exists for its target installation, SHALL operate over an authenticated HTTP call requiring
organization-administrator authority for the named organization; without a stored credential, it
SHALL operate over a direct database connection.

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

#### Scenario: init works with no checkout
- **WHEN** `copalibre init` is run in an empty directory with no CopaLibre source checked out
  anywhere on the machine
- **THEN** it writes a complete Compose file, `.env` defaults, and an installation record into that
  directory, and every subsequent command run from that directory (`doctor`, `start`, `migrate`,
  `upgrade-check`) operates correctly without a checkout

#### Scenario: init refuses to overwrite an existing installation
- **WHEN** `copalibre init` is run in a directory that already contains a CopaLibre installation
- **THEN** it refuses, naming which file already exists, and writes nothing

#### Scenario: Multiple installations coexist as separate directories
- **WHEN** an operator runs `copalibre init` in two different empty directories
- **THEN** each directory's installation runs independently (separate Compose project, separate data),
  with no interaction between them

#### Scenario: A version-sensitive command refuses a version mismatch
- **WHEN** `copalibre migrate` or `copalibre upgrade-check` is run from a directory whose recorded
  installation version does not match the running CLI binary's own version
- **THEN** it refuses, naming both the recorded and the running version, and performs no migration or
  compatibility check

#### Scenario: login stores a valid token
- **WHEN** an operator generates a personal access token from the control panel's preferences screen
  and runs `copalibre login --api-url <url>`, providing that token
- **THEN** the CLI validates the token against that installation and stores it, so subsequent
  `statistics-rebuild`/`module` commands against that installation authenticate automatically

#### Scenario: login rejects an invalid token
- **WHEN** `copalibre login` is run with a token that is expired, revoked, or does not exist
- **THEN** it refuses, reports that the token is invalid, and stores nothing

#### Scenario: statistics-rebuild works without direct database access once logged in
- **WHEN** an operator has run `copalibre login` against a target installation and then runs
  `copalibre statistics-rebuild --organization <alias>` with `DATABASE_URL` unset
- **THEN** the rebuild completes over the authenticated HTTP call, identically to the direct-database
  path's result for the same input

#### Scenario: The standalone binary requires no local Node.js installation
- **WHEN** an operator installs `copalibre` via the documented install script on a machine with no
  Node.js, Yarn, or any CopaLibre source present
- **THEN** every subcommand documented in this requirement runs successfully

#### Scenario: The standalone binary and a source checkout behave identically
- **WHEN** the same subcommand and flags are run once via the standalone binary and once via `node
  dist/main.js` from a checkout, against the same target installation
- **THEN** both produce the same output and the same exit code

### Requirement: Kubernetes instance mode

`copalibre init --kubernetes` SHALL scaffold a Helm `values.yaml` and record an installation marker
identifying the target release, namespace, and (optionally) kube-context, without writing a Compose
file or `.env` — Kubernetes' own Secret/ConfigMap mechanism stays authoritative for installation
configuration. `statistics-rebuild` and `module` subcommands run from a directory with a
Kubernetes-mode marker SHALL operate over the same authenticated HTTP surface Compose-mode instances
use once a stored login credential exists for that directory, never from cluster introspection.
`doctor`, `migrate`, `backup`, and `restore` SHALL refuse for a Kubernetes-mode marker rather than
attempting a Compose-shaped action, naming the existing Helm Job or documented mechanism to use
instead where one exists. The Helm chart SHALL provide a one-shot `create-admin` Job, matching the
existing `doctor`/`migrate` Jobs' pattern, so installation bootstrap does not require `kubectl exec`
into a running pod.

#### Scenario: init --kubernetes records an installation without a Compose file
- **WHEN** `copalibre init --kubernetes --namespace <ns> --release <name>` is run in an empty
  directory
- **THEN** it writes a `values.yaml` scaffold and an installation marker recording the namespace and
  release, and writes no `docker-compose.yml` or `.env`

#### Scenario: Admin operations work identically against a Kubernetes instance
- **WHEN** an operator has run `copalibre login` against a Kubernetes-hosted installation's public API
  URL and then runs `copalibre statistics-rebuild --organization <alias>`
- **THEN** the rebuild completes over the authenticated HTTP call, with no `kubectl` access or
  cluster-local execution involved

#### Scenario: create-admin runs as a one-shot cluster Job
- **WHEN** an operator enables the chart's `create-admin` Job against a fresh Kubernetes installation
  with no existing organization
- **THEN** the Job completes successfully, creating exactly one administrator account, without the
  operator needing `kubectl exec` into any running pod

#### Scenario: doctor, migrate, backup, and restore are not offered through the CLI for Kubernetes instances
- **WHEN** `copalibre doctor`, `copalibre migrate`, `copalibre backup`, or `copalibre restore` is run
  from a directory with a Kubernetes-mode marker
- **THEN** the CLI refuses rather than attempting a Compose-shaped action against a Kubernetes
  target — `doctor` and `migrate` name the existing Helm Job to use instead
  (`job-doctor.yaml`/`job-migrate.yaml`); `backup` and `restore` state plainly that no CLI or
  Helm-based equivalent exists yet

### Requirement: Module management subcommands
The `copalibre` CLI SHALL provide `module add`, `module list`, `module remove`, `module verify`,
`module scaffold`, and `module validate-local`. Running `copalibre module --help`/`-h` SHALL list
these subcommands with a one-line summary each, and running `copalibre module <subcommand>
--help`/`-h` SHALL print that subcommand's usage line, description, and flags, following the same
one-source-of-truth rule as the top-level CLI's help.

`copalibre init --module-dev` MAY write a companion Compose override file that bind-mounts a
local directory into the running installation and pre-authorizes installing modules from it, so a
module scaffolded via `module scaffold` can be installed and iterated on against a running instance
without a source checkout. When an operator is logged in via `copalibre login`, `module`
add/list/remove/verify SHALL operate over an authenticated HTTP call requiring installation-wide
administrator authority; without a stored credential, they SHALL operate over a direct database
connection.

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
- **THEN** the output lists `add`, `list`, `remove`, `verify`, `scaffold`, and `validate-local` with a
  one-line summary of each

#### Scenario: A scaffolded module installs from the module-dev mount without a checkout
- **WHEN** a self-hosted installation was `init`'d with `--module-dev`, a module is scaffolded
  into the mounted directory, and `module add` is run naming that directory's `file://` source
- **THEN** the module installs, using the pre-authorized allowlist entry `--module-dev` already set,
  with no other configuration required

#### Scenario: Module management requires installation-wide authority when logged in
- **WHEN** an operator logged in via a personal access token that is not an installation super-admin
  runs `copalibre module add`
- **THEN** the command is refused, naming the required authority, and no module is installed

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

