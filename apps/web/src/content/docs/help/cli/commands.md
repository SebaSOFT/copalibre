---
title: Command reference
description: Every copalibre CLI command, its usage, and its flags.
---

Every command answers `--help`/`-h` with this exact usage text, generated from a single source
inside the CLI itself — this page cannot describe a command differently from what the CLI actually
does.

## init

`copalibre init [--module-dev]`

Writes a complete installation — `docker-compose.yml`, `.env` with non-secret defaults, and an
installation marker (`.copalibre/installation.json`) — into the current directory. No source
checkout required: run it in any empty directory, and every later command (`doctor`, `start`,
`migrate`, `upgrade-check`) auto-detects that directory from the marker, the same way `.git` marks
a repository checkout. Refuses to run again in a directory that already holds an installation.
Lists the required secrets to fill into `.env` afterward. A directory stays pinned to the CopaLibre
version that `init` created it with — running several versions side by side means running the
matching CLI version per directory (see [updating](/help/cli/updating/)).

- `--module-dev`: also writes `docker-compose.module-dev.yml` and a `modules-dev/` directory,
  bind-mounted into `api`/`worker` with `COPALIBRE_MODULE_SOURCE_ALLOWLIST` pre-set — pairs with
  `module scaffold --output modules-dev/<alias>` and `module add <alias> --source
file:///var/lib/copalibre/modules-dev/<alias>` to develop a module against a running self-hosted
  instance with no source checkout.

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Validates configuration and dependencies before starting.

- `--check-proxy`: also verifies the reverse-proxy configuration
- `--proxy-url <url>`: public URL to test when `--check-proxy` is used

## dev

`copalibre dev [--hybrid]`

Runs a development environment, containerized or hybrid.

- `--hybrid`: infrastructure in Docker, application processes on the host

## start

`copalibre start`

Brings up PostgreSQL, runs doctor, and starts every process role.

## migrate

`copalibre migrate`

Runs pending database migrations.

## backup

`copalibre backup [--file <path>] [--retain <n>] [--dry-run]`

Creates a compressed **backup packet** (`.tar.gz`) under `backups/`, with the PostgreSQL dump and a
manifest (date and CopaLibre version). Applies retention: after a successful backup, deletes older
packets beyond `--retain`. Only ever deletes files matching the packet naming pattern
(`copalibre-<date>.tar.gz`) — never touches any other file under `backups/`.

- `--file <path>`: packet destination, within `backups/` (default: a timestamped name)
- `--retain <n>`: packets to keep after this backup (default: 5)
- `--dry-run`: prints the backup plan without running it

Installed module data (discipline descriptors, tournament profiles) lives in PostgreSQL, so it is
included in the dump. Object bytes in object storage (`object-storage-data`) are out of scope for
this command — back them up separately at the infrastructure level, as the self-hosting guide
already notes.

## restore

`copalibre restore --file <path> (--confirm | --dry-run) [--allow-newer-backup]`

Extracts a backup packet, restores its PostgreSQL dump, runs pending migrations, and confirms the
applied schema matches this installation — all in one invocation.

- `--file <path>`: packet to restore, within `backups/`
- `--confirm`: required to actually run the restore
- `--dry-run`: prints the restore plan without running it
- `--allow-newer-backup`: restores a packet produced by a CopaLibre version newer than the one
  currently running (refused by default)

After a successful `pg_restore`, `restore` automatically runs `copalibre migrate` and then opens a
connection to verify the applied schema version exactly matches what this installation expects (the
same check `GET /ready` uses) — so a restore never leaves code and the database silently
desynchronized. If migration fails, `restore` reports it with its exit code without claiming
success; retry with `copalibre migrate` and then `copalibre doctor`.

A packet whose manifest records a CopaLibre version newer than the one currently running is refused
before touching the database, naming both versions — upgrade this installation first, or pass
`--allow-newer-backup` if you genuinely intend to proceed.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Checks installed module compatibility and pending migrations before upgrading.

- `--target-version <semver>`: CopaLibre version to check modules and migrations against

Exits with a non-zero status if any installed module would stop being compatible with the target
version. See [updating](/help/cli/updating/) for the full sequence.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <name> --email <email>`

Creates an organization's first administrator account.

## login

`copalibre login [--api-url <url>] [--token <token>]`

Stores a personal access token so `statistics-rebuild` and `module add/list/remove/verify` work
over an authenticated HTTP connection instead of requiring direct database access (`DATABASE_URL`)
— the path to managing an already-running installation, including installing or upgrading the CLI
after Docker is already running, from a machine that never has (and never needs) database
credentials. Generate the token from the control panel's preferences screen while already logged
in, then paste it here. Validates the token with one authenticated call before storing it; refuses
and stores nothing if the token is invalid.

- `--api-url <url>`: target installation (default: `COPALIBRE_API_URL`, which `copalibre init`
  already writes to `.env`)
- `--token <token>`: the token itself (default: read from piped stdin, or an interactive prompt
  that masks each keystroke)

Stores the credential in the current directory's `.copalibre/credentials.json` (`0600`) — run
`login` from inside the installation directory `copalibre init` created. Re-running `login` in the
same directory replaces the stored token, unlike `init`'s marker.

## statistics-rebuild

`copalibre statistics-rebuild --organization <alias> [--tournament <alias>]`

Recomputes every folded statistic total (`statistic_totals`) from source facts — finalized matches'
recorded events, rosters, and hand adjustments — organization-wide by default, or narrowed to one
tournament.

- `--organization <alias>`: organization to rebuild statistics for
- `--tournament <alias>`: narrows the rebuild to one tournament within the organization

Idempotent: it drives the same `refold` and delete-then-insert write path the event-driven trigger
uses, so running it twice in a row produces byte-identical `statistic_totals` rows (aside from
`updated_at`/the internal projection version). Use it to backfill history recorded before the fold
engine existed, or to verify totals against the facts at any time. Works without `DATABASE_URL` once
logged in (`copalibre login`) — the rebuild then runs over an authenticated HTTP call instead of a
direct database connection, requiring organization-administrator authority.

## module

`copalibre module <add|list|remove|verify>`

Manages installed discipline and tournament-profile modules. `add`/`list`/`remove`/`verify` work
without `DATABASE_URL` once logged in (`copalibre login`) — each then runs over an authenticated
HTTP call instead of a direct database connection, requiring installation-wide super-admin
authority.

### module add

`copalibre module add <alias>[@range] [--source <url>] [--allow-unsatisfied-capabilities]`

Installs a module by alias, optionally pinned to a version range.

- `--source <url>`: an explicitly enabled alternate source, instead of the curated one
- `--allow-unsatisfied-capabilities`: installs even when the declared required capabilities are not
  yet satisfied

### module list

`copalibre module list [--outdated]`

Lists installed modules, or only the ones with a newer published version.

- `--outdated`: shows only modules with a newer published version

### module remove

`copalibre module remove <alias>`

Removes an installed module that no started tournament references.

### module verify

`copalibre module verify`

Re-validates every installed module against the running core version.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <name>] [--licence <licence>] [--name <name>] [--source-url <url>] [--output <dir>]`

Generates a structurally valid module package to start authoring — seeded from one of CopaLibre's
own already-valid catalogue documents, not a blind guess at the schema — as a tagged local Git
repository, ready to edit, validate, and install/submit.

- `--author <name>`: attribution author (default: Unknown)
- `--licence <licence>`: SPDX identifier (default: AGPL-3.0-only)
- `--name <name>`: deployment name (default: the alias)
- `--source-url <url>`: attribution source URL
- `--output <dir>`: where to write the module repository (default: `modules/<alias>`)

### module validate-local

`copalibre module validate-local <path>`

Validates a local module package without searching for or installing it — the same check
`module add`/`module verify` already apply.

### module submit

`copalibre module submit <path> [--upstream <owner/repo>] [--base <branch>]`

Forks `copalibre-modules`, copies the local module to a new branch, pushes it, and opens a pull
request.

- `--upstream <owner/repo>`: target repository (default: `SebaSOFT/copalibre-modules`)
- `--base <branch>`: the pull request's base branch (default: `main`)

## mcp

`copalibre mcp`

Starts a local Model Context Protocol (MCP) server over stdio, so an AI can operate CopaLibre. See
the [MCP tools detail](/help/cli/mcp/).
