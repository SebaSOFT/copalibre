# self-hosted-deployment Specification

## Purpose
Makes CopaLibre an installable, self-hostable product: one Docker image runs every process role, a
`copalibre` CLI operates it, and backups are provably restorable — realizing TMS-011 and product
invariant 5 (no mandatory hosted account).

## Requirements

### Requirement: Single multi-role image

The release SHALL ship one Docker image able to run as any documented process role, selected at
container start without rebuilding it. The `web` role SHALL serve server-rendered public pages only
for the public routes that need per-request backend data, and SHALL NOT replace the static delivery
of every other route. The release image SHALL include `git` in its runtime layers for discipline
module cloning and updates through `POST /admin/modules`.

#### Scenario: Same image runs two different roles
- **WHEN** the image is started once with role `api` and again with role `worker`
- **THEN** each container serves only its role's behavior and both report their role via `/health`

#### Scenario: The web role serves only its designated dynamic routes
- **WHEN** the image is started with role `web`
- **THEN** it serves server-rendered responses for the tournament overview, live dashboard, and stage
  bracket routes (and their locale-prefixed variants), and nothing else is expected to reach it
  directly — every other public/control/help/TV route is served by the existing static file server

#### Scenario: Module installation in running container
- **WHEN** an operator invokes module addition requiring git cloning against the `api` container
- **THEN** git executes successfully inside the container without `spawn git ENOENT` errors.

#### Scenario: The roles

- **WHEN** the image starts
- **THEN** it can run as `api`, `events`, `worker`, `scheduler`, `migrate`, `doctor` or `web`

#### Scenario: Static routes stay static

- **WHEN** a public, control-panel-shell, help or TV route without per-request data is requested
- **THEN** a separate process in front of the `web` role serves it as static files

#### Scenario: The release image

- **WHEN** `ghcr.io/sebasoft/copalibre:1.2.5` is inspected
- **THEN** its runtime layers contain `git`

### Requirement: Docker Compose Level 1 install

The repository SHALL provide a `docker-compose.yml` starting a complete single-host installation
with one command, and a dev profile with Compose Watch. It SHALL include an edge reverse proxy
unifying ingress on one published port (`COPALIBRE_PORT`, default 8080 or 80), matching bare
prefixes and subpaths alike. Services SHALL NOT require external port exposure in production.
Enabled object storage SHALL be one Garage container (`dxflrs/garage:v1.3.1`) with no auxiliary
provisioning container.

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

#### Scenario: Single-port ingress routing
- **WHEN** an operator starts the Docker Compose stack with default configuration
- **THEN** only the edge reverse proxy port is published to the host, and browser calls to `/api/auth/login`, `/organizations?mine=true`, and `/control/platform` resolve through the same origin without CORS or 404 proxy errors.

#### Scenario: Automatic Compose override discovery
- **WHEN** an operator creates `docker-compose.override.yml` in the installation directory
- **THEN** Docker Compose automatically applies the override without requiring manual editing of `COMPOSE_FILE` in `.env`.

#### Scenario: S3-compatible storage via lightweight Garage engine
- **WHEN** an operator enables the optional `object-storage` service in Docker Compose or development profiles
- **THEN** Garage provides the S3 endpoint without requiring auxiliary container sidecars for bucket initialization.

#### Scenario: What one command starts

- **WHEN** an operator runs the Compose install
- **THEN** every process role and PostgreSQL start, with Redis, object storage and SMTP as options

#### Scenario: Routing to the API

- **WHEN** a request path starts with `/api`, `/auth`, `/organizations`, `/objects`, `/admin`,
  `/installation` or `/.well-known`
- **THEN** the edge proxy routes it to the `api` service on port 3001

#### Scenario: Routing events and everything else

- **WHEN** a request path starts with `/events`, or with anything else
- **THEN** `/events` goes to the `events` service on port 3002 with SSE streaming preserved, and
  every other request (static assets, control panel shell, SSR public pages, TV kiosks) to the `web`
  service on port 4321

#### Scenario: A bare prefix with a query

- **WHEN** a request is `/organizations?mine=true`
- **THEN** it matches the `/organizations` route and is not forwarded to web SSR

#### Scenario: Services not published

- **WHEN** the installation runs in production mode
- **THEN** `api`, `events`, `web` and `web-ssr` need no external port

### Requirement: copalibre administrative CLI

The release SHALL provide a `copalibre` CLI, distributed as a standalone executable (one per
supported OS and architecture, through a documented install script) and as source runnable from a
checkout, behaving identically in both forms for every subcommand. Each subcommand SHALL behave as
the scenarios of this requirement state.

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

#### Scenario: --version prints a larger, distinct mark
- **WHEN** an operator runs `copalibre --version`
- **THEN** the CLI writes a larger ASCII-art rendering of the CopaLibre mark in brand cyan to stderr, in place of
  the compact per-invocation banner, without duplicating the version string on interactive terminals while stdout receives the bare version when redirected

#### Scenario: Top-level help lists every subcommand
- **WHEN** an operator runs `copalibre --help`, `copalibre -h`, or `copalibre` with no arguments
- **THEN** the output lists every documented subcommand with a one-line summary of what it does, with column alignment preventing longer command names from overlapping summaries, and names `copalibre <subcommand> --help` as the way to see more

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
- **WHEN** `copalibre init` is run non-interactively in a directory that already contains a CopaLibre installation without `--repair`
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

#### Scenario: Standalone CLI doctor execution on fresh host
- **WHEN** an operator runs `copalibre doctor` using the standalone SEA binary in a directory initialized with `copalibre init`
- **THEN** the CLI loads the local `.env` and passes all environmental checks without crashing or missing API URL errors.

#### Scenario: doctor runs data diagnostics by default
- **WHEN** an operator runs `copalibre doctor` against an operational database containing a tournament with non-canonical status `'completed'`
- **THEN** `doctor` reports `PASS data:tournament-status`, naming the affected tournament and expected domain statuses (`draft`, `published`, `started`, `finished`, `archived`), without mutating database records and without failing the check

#### Scenario: doctor --fix prompts for interactive repair
- **WHEN** an operator runs `copalibre doctor --fix` in an interactive terminal against a database holding a tournament with a non-canonical status
- **THEN** `doctor` presents an interactive choice of the five canonical statuses for that tournament, asks for confirmation, and commits the approved change transactionally with an audit entry

#### Scenario: doctor --fix without a TTY applies nothing
- **WHEN** an operator runs `copalibre doctor --fix` with stdin piped or redirected (no TTY)
- **THEN** `doctor` reports that repair requires an interactive terminal and applies no changes

#### Scenario: Preflight detects Docker socket permission failure
- **WHEN** `copalibre init` or `copalibre doctor` runs on a host where the current user cannot access `/var/run/docker.sock`
- **THEN** execution halts with an actionable error explaining that the user must be added to the `docker` group (`sudo usermod -aG docker $USER`) rather than failing with an unhandled exception.

#### Scenario: Preflight detects host port collision
- **WHEN** an operator runs `copalibre init` while port 8080 or 5432 is already bound by another process
- **THEN** the CLI reports the conflicting port, identifies the offending process if inspectable, and prompts the operator to select an alternative port.

#### Scenario: Cryptographic secrets generated during init
- **WHEN** `copalibre init` writes the `.env` file
- **THEN** `GARAGE_RPC_SECRET` contains a freshly generated 32-byte hex secret, and the file contains no unresolved variable placeholders.

#### Scenario: Reverse proxy snippet export
- **WHEN** an operator requests external proxy template generation via `copalibre init --proxy nginx`
- **THEN** the CLI outputs a ready-to-use Nginx virtual host configuration configured with `proxy_buffering off;`, `X-Accel-Buffering "no";`, and a 24-hour read timeout for `/events/`.

#### Scenario: init scaffolds local modules directory and prompts for starter disciplines
- **WHEN** an operator runs `copalibre init`
- **THEN** the CLI creates the `./modules/disciplines/` and `./modules/profiles/` directories with starter documentation, binds the directory into the compose environment for both backend containers and frontend containers, and records the selected starter disciplines for bootstrap.

#### Scenario: upgrade orchestrates executable, compose, images, migrations, and module checks
- **WHEN** an operator runs `copalibre upgrade`
- **THEN** the CLI verifies available target version, updates the CLI executable, reconciles `COPALIBRE_VERSION`, `docker-compose.yml`, and `.env` variables, pulls updated images, executes database migrations, recreates active containers with `--force-recreate`, and queries for outdated module updates.

#### Scenario: upgrade --check inspects available platform and module updates non-destructively
- **WHEN** an operator runs `copalibre upgrade --check`
- **THEN** the CLI prints available platform versions and outdated modules without applying changes or restarting containers.

#### Scenario: doctor validates host .env configuration
- **WHEN** an operator runs `copalibre doctor` on a host where `.env` is missing required secrets or defines empty values
- **THEN** the CLI identifies each missing or unconfigured variable directly on the host with actionable guidance before or alongside launching containerized checks

#### Scenario: init repairs existing installation directory
- **WHEN** an operator runs `copalibre init` in an existing installation directory with `--repair` or in interactive mode
- **THEN** the CLI creates timestamped backups of existing `.env` and `docker-compose.yml`, adds missing defaults and assets without overwriting existing values or key material, and leaves the Compose file byte-for-byte unchanged

#### Scenario: init repair warns about missing required Compose services
- **WHEN** an existing installation's Compose file lacks one or more default-profile services present in the shipped template
- **THEN** repair warns which services are missing and prints their YAML snippets for review, without modifying the Compose file

#### Scenario: init repair ignores optional Compose profiles
- **WHEN** an existing installation's Compose file omits a service defined only under an optional profile
- **THEN** repair does not warn about that service or print a snippet for it

#### Scenario: init email providers match runtime
- **WHEN** an operator configures email through the interactive wizard or email flags
- **THEN** the CLI accepts `smtp`, `resend`, `brevo`, or `mailgun`, writes corresponding runtime environment variables, uses local SMTP by default, and requires both Mailgun API key and domain for Mailgun

#### Scenario: stop halts running containers
- **WHEN** an operator runs copalibre stop against a running Compose installation
- **THEN** the CLI halts running containers without removing volume data, or removes containers and networks if --down is provided

#### Scenario: stop dev halts development Compose services only
- **WHEN** an operator runs copalibre stop --dev
- **THEN** the CLI stops the development infrastructure profile and leaves separately started host Yarn processes untouched

#### Scenario: restart performs ordered startup and health verification
- **WHEN** an operator runs copalibre restart against a Compose installation
- **THEN** the CLI stops the running stack, brings up PostgreSQL, runs the doctor check unless --no-doctor is supplied, then starts remaining services with --wait

#### Scenario: restart dev restarts development Compose services
- **WHEN** an operator runs copalibre restart --dev
- **THEN** the CLI restarts the development infrastructure profile without claiming to stop host-run Yarn processes

#### Scenario: status displays Compose health and ingress endpoints
- **WHEN** an operator runs copalibre status against a Compose installation
- **THEN** the CLI displays container health, active published ingress ports, and the gateway URL and health result

#### Scenario: status supports machine-readable output
- **WHEN** an operator runs copalibre status --json
- **THEN** the CLI emits a JSON status document describing installation mode, services, ingress ports, gateway URL, and health

#### Scenario: Kubernetes status uses installation marker or gives an inspection command
- **WHEN** an operator runs copalibre status in a Kubernetes-mode directory
- **THEN** the CLI reports release, namespace, and recorded context and either lists matching pods with kubectl or prints the equivalent kubectl get pods command

#### Scenario: lifecycle commands refuse Kubernetes mutations with native alternatives
- **WHEN** an operator runs copalibre start, copalibre stop, or copalibre restart in a directory initialized with --kubernetes
- **THEN** the CLI refuses with actionable helm or kubectl commands appropriate to the requested lifecycle action

#### Scenario: The subcommands

- **WHEN** an operator lists the CLI's subcommands
- **THEN** it offers `init`, `doctor`, `dev`, `dev --hybrid`, `start`, `migrate`, `create-admin`,
  `login`, `statistics-rebuild`, `backup`, `restore`, `upgrade-check`, `upgrade` and `mcp`

#### Scenario: doctor checks the host .env first

- **WHEN** `copalibre doctor` runs
- **THEN** before or alongside its containerized checks it reports missing, empty or unconfigured
  `DATABASE_URL` or `POSTGRES_PASSWORD`, `COPALIBRE_APP_URL`, `COPALIBRE_BOOTSTRAP_TOKEN`,
  `COPALIBRE_JWT_ISSUER`, `GARAGE_RPC_SECRET` and email provider keys as actionable failures

#### Scenario: doctor reports data integrity informationally

- **WHEN** the database is reachable when `copalibre doctor` runs
- **THEN** it reports discrepancies as the `data:tournament-status` item, which never fails the
  check or blocks `copalibre start`

#### Scenario: doctor uses local images

- **WHEN** doctor runs containerized checks
- **THEN** it uses locally present images without downloading them again

#### Scenario: doctor repairs only interactively

- **WHEN** `copalibre doctor` runs with `--fix` or `--interactive`
- **THEN** on a TTY it starts a non-destructive, decision-support repair prompt; without one it says
  repair needs a TTY and applies nothing

#### Scenario: The banner

- **WHEN** any subcommand runs
- **THEN** a banner naming the product, its version and its license is printed first, to a stream
  that never mixes with the subcommand's stdout, with the monogram and logo in brand cyan on a
  color-capable TTY

#### Scenario: Help comes from one source

- **WHEN** an operator runs `copalibre --help` or `copalibre <subcommand> --help`
- **THEN** the top level lists every subcommand with a one-line summary, padded so no name overlaps
  its summary, and each subcommand prints its usage line, description and flags, both from one
  source so they cannot drift

#### Scenario: upgrade-check evaluates a target

- **WHEN** `upgrade-check` runs for a target version
- **THEN** it checks every installed module's declared compatibility range, reports pending
  migrations, and exits non-zero if any module would become incompatible

#### Scenario: upgrade coordinates the whole lifecycle

- **WHEN** `copalibre upgrade` runs
- **THEN** it self-updates the CLI to the target or latest stable release; reconciles
  `docker-compose.yml` and new `.env` variables, updating `COPALIBRE_VERSION` with the image tags
  and preserving port bindings and volumes; pulls images and migrates through `copalibre migrate`;
  restarts the stack with `--force-recreate`; and prompts for available module updates

#### Scenario: init writes a runnable installation

- **WHEN** `copalibre init` runs in a directory without an installation
- **THEN** it writes a Compose file and environment defaults, needs no checkout, and records the
  CopaLibre version and an installation identifier so later commands identify the installation

#### Scenario: init preflights the host

- **WHEN** `copalibre init` runs
- **THEN** it checks Docker daemon connectivity, socket permissions, the Compose version and port
  collisions

#### Scenario: init asks and generates

- **WHEN** `copalibre init` runs on a TTY
- **THEN** it asks for the public application and API domains and an email provider, and writes a
  fully-interpolated `.env` with defaults and random secrets for every required variable, including
  `GARAGE_RPC_SECRET`, `COPALIBRE_JWKS_URI`, `COPALIBRE_JWT_AUDIENCE`, `COPALIBRE_JWT_ISSUER`,
  `COPALIBRE_PORT`, `COPALIBRE_API_PORT`, `COPALIBRE_EVENTS_PORT` and `COPALIBRE_IMAGE`

#### Scenario: init sets up JWT verification

- **WHEN** `copalibre init` runs
- **THEN** it generates a 2048-bit RSA keypair (`jwt-private.pem` and `jwks.json`) and configures
  asymmetric JWT verification that works without an external OIDC provider

#### Scenario: init scaffolds local modules

- **WHEN** `copalibre init` runs
- **THEN** it scaffolds `./modules/disciplines/` and `./modules/profiles/` with README
  documentation, configures `COPALIBRE_MODULE_SOURCE_ALLOWLIST` with read-only bind-mounts for
  backend containers (rules engine and descriptors) and frontend containers (media assets, emblems
  and banners), and on a TTY asks which starter disciplines to provision

#### Scenario: init exports proxy templates

- **WHEN** `copalibre init` runs
- **THEN** it exports `deploy/templates/nginx/` configurations with unbuffered SSE proxying,
  long-lived connection timeouts and WebSocket upgrade rules for gateways such as Nginx or
  CloudPanel

#### Scenario: init repairs, never overwrites

- **WHEN** `copalibre init` runs where an installation exists
- **THEN** without interactive confirmation or `--repair` it refuses; with either it reconciles
  non-destructively, backing up `.env` and `docker-compose.yml` with timestamps before adding
  missing variables, keypairs or directories

#### Scenario: Repair leaves the Compose file alone

- **WHEN** repair finds default-profile services missing from the installation
- **THEN** it keeps `docker-compose.yml` byte-for-byte, warns, and prints ready-to-review YAML
  snippets without applying them; services behind optional profiles raise no warning

#### Scenario: Email providers

- **WHEN** email is configured
- **THEN** only `smtp`, `resend`, `brevo` or `mailgun` is accepted, Mailgun needs
  `COPALIBRE_MAILGUN_API_KEY` and `COPALIBRE_MAILGUN_DOMAIN`, and local SMTP is the default

#### Scenario: Commands work from the installation directory

- **WHEN** `doctor`, `start`, `stop`, `restart`, `status`, `migrate` or `upgrade-check` runs in a
  directory with a recorded installation
- **THEN** it operates on that directory's files without a checkout

#### Scenario: Version-sensitive commands refuse a mismatch

- **WHEN** `init` is re-run, or `migrate` or `upgrade-check` runs, with a CLI version different from
  the directory's recorded one
- **THEN** it refuses, naming both versions

#### Scenario: init --module-dev

- **WHEN** `init --module-dev` runs
- **THEN** it also writes a Compose override bind-mounting a local module-development directory,
  with no extra flag needed on `docker compose`

#### Scenario: The standalone binary's environment

- **WHEN** the standalone binary starts
- **THEN** it loads `.env` from the working directory when present, and externalizes or stubs
  `sharp` so no CommonJS `import.meta.url` crash occurs

#### Scenario: login stores a token

- **WHEN** `copalibre login` runs with a token from a flag, stdin or a prompt
- **THEN** it validates the token against the installation and stores it for `statistics-rebuild`
  and `module` subcommands

#### Scenario: statistics-rebuild picks its channel

- **WHEN** `statistics-rebuild` runs
- **THEN** with a stored credential it calls HTTP requiring organization-administrator authority for
  the organization; without one it uses a direct database connection

#### Scenario: start --dev

- **WHEN** `copalibre start --dev` runs
- **THEN** the containerized development Compose profile starts in the background

#### Scenario: Lifecycle commands and Kubernetes

- **WHEN** `start`, `stop` or `restart` runs against a Kubernetes-mode installation
- **THEN** it refuses with Kubernetes-native alternatives and does not mutate the cluster

#### Scenario: stop

- **WHEN** `copalibre stop` runs
- **THEN** it stops the installation keeping volumes; `--down` removes containers and networks
  keeping volumes; `--dev` stops only the development infrastructure profile and leaves processes
  started by `dev --hybrid` alone

#### Scenario: restart

- **WHEN** `copalibre restart` runs
- **THEN** it brings PostgreSQL up first, runs the Compose doctor check before the other services
  unless `--no-doctor` is given, and waits for health; `--dev` restarts only the development
  infrastructure profile

#### Scenario: status

- **WHEN** `copalibre status` runs
- **THEN** it reports the mode and health: for Compose, container states, published ingress ports
  and the gateway health URL, as JSON with `--json`; for Kubernetes, the recorded release, namespace
  and context, the release's pods when `kubectl` is available, and otherwise the exact inspection
  command

### Requirement: Kubernetes instance mode

`copalibre init --kubernetes` SHALL scaffold a Helm `values.yaml` and record an installation marker
with the release, namespace and optional kube-context, without a Compose file or `.env`. From such a
directory, `statistics-rebuild` and `module` SHALL use the authenticated HTTP surface once logged
in, never cluster introspection, and `doctor`, `migrate`, `backup` and `restore` SHALL refuse,
naming the Helm Job or mechanism to use instead. The chart SHALL provide a one-shot `create-admin`
Job.

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

#### Scenario: Kubernetes owns configuration

- **WHEN** a Kubernetes installation is configured
- **THEN** its Secrets and ConfigMaps stay authoritative

#### Scenario: Bootstrap without exec

- **WHEN** an operator bootstraps the first admin
- **THEN** the `create-admin` Job, like the `doctor` and `migrate` Jobs, needs no `kubectl exec`
  into a running pod

### Requirement: Module management subcommands

The `copalibre` CLI SHALL provide `module add`, `list`, `remove`, `verify`, `scaffold` and
`validate-local`, with `module --help` and each subcommand's help following the top-level one-source
rule. Logged in, `add`, `list`, `remove` and `verify` SHALL call HTTP requiring installation-wide
administrator authority; without a credential, they SHALL use a direct database connection. `init
--module-dev` MAY write a Compose override mounting a local module directory.

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

#### Scenario: The module-dev mount

- **WHEN** `init --module-dev` writes its override
- **THEN** the mounted directory is pre-authorized, so a module made with `module scaffold` installs
  and iterates against a running instance without a checkout

### Requirement: Verified backup and restore

`copalibre backup` SHALL produce a compressed, self-describing packet under `backups/` that
`copalibre restore` restores into a clean installation passing an integrity check, and SHALL keep at
most `--retain` packets (default 5), deleting only its own. `copalibre restore` SHALL refuse a
packet from a newer version unless overridden, SHALL migrate the restored data automatically, and
SHALL confirm the schema matches the installation before reporting success.

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

#### Scenario: What a packet holds

- **WHEN** a backup is taken
- **THEN** the packet contains the database dump and a manifest with the backup timestamp and the
  producing CopaLibre version

#### Scenario: Pruning

- **WHEN** a backup succeeds with more packets than `--retain`
- **THEN** the oldest are deleted, and only files matching the packet naming pattern are ever
  deleted

### Requirement: Reverse-proxy conformance
The release SHALL document and test at least one reverse-proxy configuration (Caddy or NGINX)
preserving original scheme/host/client-address forwarding, disabling buffering/caching on SSE routes,
providing sufficiently long idle timeouts with heartbeat support, and restricting trusted client-IP
resolution to an explicit, operator-scoped allowlist of proxy addresses. The Kubernetes Helm chart's
Ingress SHALL default to the same unbuffered-SSE guarantee for its default ingress controller.

#### Scenario: Proxy conformance test detects SSE buffering
- **WHEN** the conformance test suite runs against a reverse-proxy configuration that buffers
  responses on an SSE route
- **THEN** the test fails and identifies the buffering misconfiguration

#### Scenario: Example configs restrict trusted client-IP resolution
- **WHEN** an operator reviews the provided Caddy or NGINX example configuration
- **THEN** it contains an explicit trusted-proxy allowlist directive (not a default that trusts
  every upstream) and documentation directing the operator to scope it to their actual proxy
  network

#### Scenario: Kubernetes Ingress disables SSE response buffering by default
- **WHEN** the Helm chart renders its Ingress with default values under the default `nginx` ingress
  class
- **THEN** the rendered Ingress carries an annotation disabling proxy response buffering, so real-time
  score events reaching the `events` host are not delayed by controller-side buffering

### Requirement: Continuous integration builds and smoke-tests the release image
The CI pipeline SHALL build the release Docker image and start a full Compose profile as an
automated `deploy-smoke-test` job that probes every process role's health endpoint before a pull
request can merge.

#### Scenario: A broken image fails the pipeline before merge
- **WHEN** a pull request introduces a change that prevents one process role's container from
  reaching a healthy state under Compose
- **THEN** the `deploy-smoke-test` CI job fails and the pull request shows a failing check

### Requirement: Initial Administrator Invitation Web Flow
The `apps/web` application SHALL provide an `/invitations/accept` route capable of parsing the acceptance token emitted by `copalibre create-admin` and rendering the password definition interface.

#### Scenario: Administrator accepts onboarding invitation
- **WHEN** an invited administrator navigates to `/invitations/accept?token=<token>`
- **THEN** the web application renders the invitation acceptance view rather than a 404 Not Found error.

### Requirement: `copalibre dev --hybrid` completes unattended
`copalibre dev --hybrid` SHALL complete its infrastructure-startup step and proceed to running
application servers without manual intervention, when all infrastructure containers start successfully.

#### Scenario: A one-shot init container exits successfully
- **WHEN** the infrastructure profile's one-shot init container (e.g. object-storage bucket
  provisioning) completes and exits with status 0
- **THEN** `copalibre dev --hybrid` SHALL treat the infrastructure profile as ready and proceed to
  migrations and application servers, rather than treating the exited container as a failure

### Requirement: Browser-facing media paths reach the API in every deployment mode
The application SHALL keep emblem and discipline-background URLs on the browser's application origin and route their requests to the API in local development and supported self-hosted proxy topologies. The proxy SHALL preserve the API's status, response bytes, and content type rather than serving a web fallback document.

#### Scenario: Local development serves emblems and discipline backgrounds
- **WHEN** a browser requests emblem upload, supported deletion, or read under `/organizations/*`, or requests a discipline background through `/objects/discipline-background-image`
- **THEN** the local Astro development proxy forwards each request to the API and preserves its authorization, status, response bytes, and content type

#### Scenario: Local development uses a configured loopback hostname
- **WHEN** `COPALIBRE_SITE` names a hostname mapped to `127.0.0.1`
- **THEN** the development web server accepts that hostname while retaining localhost as its default, and the same-origin emblem and discipline-background paths continue to use the local API proxy

#### Scenario: Self-hosted gateway serves all media operations
- **WHEN** a browser requests emblem upload, supported deletion, or read under `/organizations/*`, or a discipline background under `/objects/*` on the single-origin gateway
- **THEN** the gateway forwards the request to the API and preserves its authorization, status, response bytes, and content type

#### Scenario: Self-hosted web edge serves all media operations
- **WHEN** the browser requests emblem upload, supported deletion, or read under `/organizations/*`, or a discipline background under `/objects/*` through the self-hosted web edge
- **THEN** the request reaches the API before static or SSR fallback and preserves its authorization, status, response bytes, and content type

#### Scenario: Kubernetes web edge resolves the release-scoped API service
- **WHEN** the Helm chart deploys the web edge with its default values
- **THEN** Caddy sends browser-facing media requests to that release's API service and not to a fixed Compose-only hostname

### Requirement: Tournament status data-integrity diagnostic and repair

`copalibre doctor` SHALL report a tournament whose `status` is not a canonical `TournamentStatus` as
an informational `data:tournament-status` check naming each one and its status, never failing or
blocking `copalibre start`. With `--fix` or `--interactive` on a TTY, it SHALL offer the canonical
statuses and, once one is chosen and confirmed, update it and record an audit entry in one
transaction; declining SHALL write nothing, and without a TTY it SHALL apply nothing.

#### Scenario: A non-canonical status is reported without failing doctor
- **WHEN** a tournament's `status` column holds `'completed'`, left over from an old import script
- **THEN** `copalibre doctor` reports it under `data:tournament-status` as `PASS` (informational),
  naming the tournament and pointing to `copalibre doctor --fix`

#### Scenario: An operator repairs the status interactively
- **WHEN** an operator runs `copalibre doctor --fix` from an interactive terminal, selects `finished`
  for a tournament reported with status `'completed'`, and confirms
- **THEN** the tournament's `status` column becomes `finished`, an audit entry records the previous and
  resulting status and the reason, and a subsequent `copalibre doctor` run reports no anomaly for it

#### Scenario: Declining a repair prompt leaves the record untouched
- **WHEN** an operator runs `copalibre doctor --fix`, and either declines to select a status or declines
  the confirmation prompt for an affected tournament
- **THEN** that tournament's `status` column is not modified and no audit entry is written for it

#### Scenario: --fix without a TTY never mutates data
- **WHEN** `copalibre doctor --fix` runs with stdin piped or redirected, such as from a script or CI job
- **THEN** it reports that interactive repair requires a TTY and applies no changes, regardless of how
  many anomalies were detected

#### Scenario: The canonical statuses

- **WHEN** a status is checked
- **THEN** `draft`, `published`, `started`, `finished` and `archived` are canonical; anything else
  is reachable only through an out-of-band write

#### Scenario: The audit entry

- **WHEN** a repair is confirmed
- **THEN** the entry is `data-integrity.repaired`, actor `operator:copalibre-doctor`, authorization
  context `doctor-repair`

### Requirement: Static control entry redirects on the requested origin
The pre-rendered `/control/` entry route SHALL send browsers to `/control/login` on the same origin that served the entry page, in local, reverse-proxy, and Kubernetes deployments. It SHALL preserve a supplied `returnTo` query parameter and SHALL NOT direct browsers to a build-time hostname or port.

#### Scenario: Reverse proxy serves the control entry
- **WHEN** a browser requests `/control/` through a self-hosted reverse proxy on an installed domain
- **THEN** the redirect target is `/control/login` on that same domain and does not contain a build-time hostname or port

#### Scenario: Kubernetes ingress serves the control entry
- **WHEN** a browser requests `/control/` through the configured Kubernetes ingress
- **THEN** the redirect target remains on the ingress origin and the login route is reachable through the same ingress

#### Scenario: Local development serves the control entry
- **WHEN** a browser requests `/control/` from the local web server
- **THEN** the redirect target stays on the local web server origin

#### Scenario: Return destination is preserved
- **WHEN** a request to `/control/` includes a `returnTo` query parameter
- **THEN** the login route retains the parameter with its value safely URL-encoded

### Requirement: Public self-hosting documentation truthfulness

The repository's `docs/self-hosting.md` and `copalibre-app`'s `/self-hosting` page SHALL accurately
describe the self-hosted installation, without fictitious commands, ports, or single-container
SQLite deployments.

#### Scenario: Truthful Compose architecture presented in public self-hosting documentation
- **WHEN** an operator or evaluator inspects the public self-hosting documentation
- **THEN** the documented Compose architecture and references describe the real multi-service structure (`postgres`, `migrate`, `api`, `events`, `web`, `worker`, `scheduler`, `gateway`) and real published gateway ingress port (8080) rather than a non-existent single-container SQLite service.

#### Scenario: Canonical installer redirect behavior
- **WHEN** an operator executes `curl -fsSL https://www.copalibre.app/install.sh | bash`
- **THEN** the endpoint resolves or delegates to the official release installer script from GitHub Releases (`https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh`), installing the standalone `copalibre` binary without failure.

#### Scenario: Truthful CLI commands and terminal examples
- **WHEN** an operator follows the documented command examples on the self-hosting guide
- **THEN** the commands match real CLI syntax (`copalibre backup`, `copalibre restore --file <path> --confirm`, `copalibre upgrade-check --target-version <version>`) and do not fail due to fictitious subcommands, missing required flags, or non-existent download endpoints.

#### Scenario: What the documentation covers

- **WHEN** the self-hosting documentation is read
- **THEN** it covers the standalone CLI install and canonical redirect endpoint, `copalibre init`
  scaffolding, the required PostgreSQL and edge reverse proxy services, `copalibre backup` and
  `copalibre restore --confirm`, and `copalibre upgrade-check` compatibility verification

### Requirement: Lifecycle email notifications use the configured email provider without extra configuration
Lifecycle email notifications SHALL be delivered by `apps/worker` through the same email provider
configuration as invitations and password resets (`COPALIBRE_EMAIL_PROVIDER`, `COPALIBRE_EMAIL_FROM`,
`COPALIBRE_APP_URL` and the selected provider's credentials), and SHALL NOT require any additional
environment variable. The development stack SHALL deliver them to Mailpit through the existing SMTP
configuration. Loading demo data with `copalibre dev demo` SHALL NOT send email.

#### Scenario: Operator needs no new setting
- **WHEN** an installation already delivers invitations through a configured provider
- **THEN** lifecycle notification emails are delivered through that provider with no further configuration

#### Scenario: Development stack shows the email in Mailpit
- **WHEN** a tournament is created in the development stack
- **THEN** the notification email for the organization's administrators appears in Mailpit

#### Scenario: Demo loading is silent
- **WHEN** an operator runs `copalibre dev demo panamericano-clubes-2025`
- **THEN** no email is sent for the clubs, entrants or tournament it creates

### Requirement: Public self-hosting documentation describes notification email behaviour
The public self-hosting documentation SHALL state which lifecycle events send email, who receives it, that
the language is the organization's primary language, that every email carries the organization header and
the Copa Libre signature linking to `www.copalibre.app`, that imports and demo loading send no email, and that
a delivery whose outcome is unknown is not retried.

#### Scenario: Documentation matches behaviour
- **WHEN** the docs verification runs
- **THEN** the documented events and audiences match the events and audiences this change specifies

### Requirement: Doctor inspects installed module assets in the active storage
`copalibre doctor` SHALL, when the database is reachable, check that every installed module asset is recorded under the active object-storage profile and readable through it, and SHALL report a mismatch or a missing object as a warning that names the module, the asset and the remedy, without printing any storage credential.

#### Scenario: A host-side import into the filesystem profile is flagged
- **WHEN** a module was added with the filesystem profile while the stack serves from object storage
- **THEN** doctor warns that the module's asset is stored under the filesystem profile and says to add the module again with the stack's object-storage variables

#### Scenario: A healthy installation passes
- **WHEN** every installed module asset is recorded under the active profile and readable
- **THEN** the module-assets check passes

#### Scenario: Doctor without a database skips the check
- **WHEN** the database is not reachable
- **THEN** the module-assets check is skipped with the reason
