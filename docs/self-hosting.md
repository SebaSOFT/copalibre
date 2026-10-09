# Self-Hosting CopaLibre

Install the standalone CLI as shown in [README](../README.md#get-started). Optionally run
`copalibre preflight` to verify host requirements (Docker daemon, socket permissions, Compose v2,
available ports), then run `copalibre init` (or `copalibre init --wizard` for interactive domain and
TLS proxy configuration) once in an empty installation directory. It writes a complete installation
into the current directory — `docker-compose.yml`, `.env` with non-secret local defaults, and a
`.copalibre/installation.json` marker — and lists values that must be supplied by the operator.
`init` doesn't require running from the checkout's own root: `cd` into any empty directory first
(a separate data/config directory, or a second installation) and run it there; every later command
(`doctor`, `start`, `migrate`, `upgrade-check`) auto-detects that directory afterward from the
marker, the same way `.git` marks a checkout — no source checkout is needed for anything past the
CLI binary itself. A directory stays pinned to the CopaLibre version that created it: running
several versions side by side means running the matching CLI version per directory, and
`migrate`/`upgrade-check` refuse with a clear message on a mismatch rather than risking the wrong
migration or compose shape (see [Upgrading](#upgrading)). Re-running `init` against an existing
installation's directory refuses rather than overwriting it. `--module-dev` additionally sets up a
`modules-dev/` bind mount for developing a module against a running instance — see
[`docs/MODULES.md`](MODULES.md). Set a strong PostgreSQL password, an opaque
`COPALIBRE_BOOTSTRAP_TOKEN`, OIDC JWKS/issuer/audience values, the public browser client ID, and one
supported email provider configuration. Then run `copalibre start` or
`docker compose up --detach --wait`.

### Notification email

Lifecycle email uses the provider already configured for invitations (`COPALIBRE_EMAIL_PROVIDER`,
`COPALIBRE_EMAIL_FROM`, `COPALIBRE_APP_URL` and the provider's credentials); it needs no other
setting, and the development stack delivers it to Mailpit. `apps/worker` sends it from the
transactional outbox (lifecycle email notifications):

| Event                                           | Goes to                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `tournament.created`, `club.created`            | The organization's `admin` assignments                                                                  |
| `entrant.registered`, `entrant.squad-submitted` | The organization's `admin` assignments and the `tournament-admin` assignments scoped to that tournament |

The actor is not emailed about their own action, and an address held through several assignments gets
one email. Every email, including invitations and password resets, renders in the organization's
primary language (English for a password reset, which has no organization) with the organization's
emblem and name in the header and a Copa Libre signature linking to `https://copalibre.app`. A club
submitting its squad sends one email, for `entrant.squad-submitted`. CSV imports and `copalibre dev
demo` mark their events `origin: 'import'` and send none.

**The same email is never sent twice to the same recipient.** The worker reserves each
`(outbox event, recipient)` pair in `processed_markers` before calling the provider, so a retry, a
crash and redelivery, two workers, or an operator re-enqueue from the dead-letter inspector cannot
send it again. The reservation is released only when the provider definitely rejects the message. When
the outcome is unknown, such as a timeout after the request was sent, the email is not retried: a
possibly missed email is accepted over a possible duplicate, and an operator can resend it by hand.

**How many emails may have been missed is visible.** The worker counts every delivery attempt by
outcome (`sent`, `already-sent`, `rejected` for a definite refusal, `unknown`) and returns the counts
under `emailDelivery` in `GET /jobs/metrics`, beside the relay's own queue figures. The worker listens on
port 3003 inside the Compose network and is not published to the host. A non-zero `unknown` is a
recipient who may have missed an email, so it is the figure to alert on. The counts are per replica and
start from zero when it restarts. Each unknown outcome is also logged as one JSON line,
`Email delivery outcome unknown; not retried`, with the event type, the event id, a hash of the recipient
and the error class. It never carries the address, nor the provider's error message, which can repeat
the address it failed on.

From the installation directory, `copalibre status` reports container state, the published ingress
port, and gateway health. `copalibre restart` stops the stack, starts PostgreSQL, runs `doctor`, then
starts the remaining services after health checks pass. `copalibre stop` stops containers while
preserving volumes; `copalibre stop --down` removes containers and networks but still retains
volumes. Add `--dev` to use the checkout's development Compose file. Those flags manage Compose
containers only; they do not stop host Yarn processes started by a separate `copalibre dev --hybrid`
invocation. In Kubernetes mode, `start`, `stop`, and `restart` print `helm`/`kubectl` guidance;
`status` reads the installation marker and queries pods when `kubectl` is available.

The standalone binary needs Docker and Docker Compose v2. The source checkout's `./copalibre`
wrapper additionally needs Node.js 24 and Corepack. Run that wrapper by its path from the empty
installation directory; do not run `init` in the checkout root. The generated `.env` pins published
images matching the CLI version. Building unpublished source requires building both Docker targets
from the checkout root and selecting those local images, as described in README.

Set `GARAGE_RPC_SECRET` in `.env` to a value generated by `openssl rand -hex 32`, even when
`optional-adapters` is disabled: Compose evaluates its required interpolation before selecting
services. This does not enable Garage. Keep the generated private signing key and configuration
out of version control.

The gateway publishes HTTP on `COPALIBRE_PORT` (8080 by default); Compose also publishes API, events
and web service ports. Restrict access to those ports according to your deployment network.
Compose does not terminate TLS. Put Caddy or NGINX at the public edge and route the application
hostname through `gateway:80` on the Compose network, or `127.0.0.1:8080` from a proxy running on
the host. The gateway dispatches same-origin API, authentication, SSE and web traffic; the web
container dispatches dynamic pages to `web-ssr:3005`. Do not duplicate its route list at the edge.
Use `deploy/proxy/Caddyfile` or `deploy/proxy/nginx.conf`, set public URLs and preserve unbuffered SSE.
Verify the live address with
`copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check`.

## Managing An Installation Without Database Access

`copalibre create-admin` always runs from any machine with no database connection, as a pure
authenticated HTTP call against `COPALIBRE_API_URL`. `copalibre login` extends that to
`statistics-rebuild` and `module add/list/remove/verify`: generate a personal access token from the
control panel's preferences screen while already signed in, then run `copalibre login --api-url
https://api.example`, pasting the token when prompted (or `--token <token>`, or piped via stdin).
This is also the path to installing or upgrading the CLI itself after Docker is already running.

`login` stores the token in the current directory's `.copalibre/credentials.json` (`0600`) —
alongside, but never merged into, `init`'s non-secret `installation.json` marker. Run it from
inside the installation directory `copalibre init` created. `restore`'s post-migration schema
check still runs directly against the database, deliberately: it may run before the API process is
even up.

## Organization Language And Timezone

Every organization carries a `primaryLanguage` (one of `en`, `es`, `fr`, `pt`, `it`, `de`, `ru`, `zh`) and
a `timezone` (an IANA identifier), defaulting to `es`/`UTC` when not specified at creation. Both are
presentation-layer defaults only — stored instants remain UTC throughout. Change either after
creation with a bearer token holding the organization's `admin` role:

```bash
curl -X PATCH https://api.example/organizations/<alias>/settings \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"primaryLanguage": "en", "timezone": "America/Argentina/San_Juan"}'
```

A user's own interface language is a separate, per-browser preference (never synced to their
account) that this installation's control panel and public pages resolve from, in order: an explicit
choice already stored in that browser, then the organization's `primaryLanguage`, then the browser's
own language list, then English.

The help site defaults to English at `/help/`, with translated pages at
`/{locale}/help/` for the other seven languages. Generated `llms.txt`/`llms-full.txt` remain English;
`llms-authoring.txt` separately documents module authoring.

## Rate Limits

A few endpoints bound request volume to blunt automated abuse. Limits are counted per API
process and reset on restart:

| Endpoint group                                                                                                      | Key                                        | Limit         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------- |
| `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /installation/bootstrap/admin` | client IP, per endpoint                    | 5 per 60 s    |
| Person photo / club emblem / organization emblem uploads; module install/verify                                     | authenticated principal, per endpoint      | 20 per 60 s   |
| Every other route (safety net)                                                                                      | client IP, or principal when authenticated | 1000 per 60 s |

Exceeding a limit returns `429` with `Retry-After` headers. If an operator troubleshooting sees
unexpected 429s — e.g. during a bulk photo-upload session, which allows 20 uploads per principal
per minute per endpoint — wait for the 60-second window to roll over or batch the work more slowly.
The client IP is resolved honoring `X-Forwarded-For` (the bundled reverse proxy configuration is
trusted), so users behind one shared office/NAT address share the unauthenticated limits between
them.

## Object Storage

Participant evidence, club/organization emblems, person photos, and module assets are stored
through an S3-compatible adapter (`packages/object-storage`), configured with
`COPALIBRE_OBJECT_STORAGE_URL`, `_ACCESS_KEY`, `_SECRET_KEY`, `_BUCKET`, and optionally `_REGION`
in `.env`. Point these at AWS S3, Cloudflare R2, Backblaze B2, or any other S3-compatible provider;
leaving `COPALIBRE_OBJECT_STORAGE_URL` unset falls back to storing objects on the local filesystem
under `COPALIBRE_DATA_DIR`, with no separate object-storage service required for a single-host
install.

To use the bundled lightweight [Garage](https://garagehq.deuxfleurs.fr/) container instead of an
external provider, enable the `optional-adapters` Compose profile and set `GARAGE_RPC_SECRET`
(`openssl rand -hex 32`) plus the matching `COPALIBRE_OBJECT_STORAGE_*` values in `.env`:

```bash
# Generate a value with openssl rand -hex 32, then place it in .env:
GARAGE_RPC_SECRET=replace-with-generated-value
COPALIBRE_OBJECT_STORAGE_URL=http://object-storage:3900
COPALIBRE_OBJECT_STORAGE_REGION=garage
COPALIBRE_OBJECT_STORAGE_BUCKET=copalibre
```

For a binary-created installation, also copy `deploy/garage/garage.toml` from the matching
release into the same relative path under the installation directory before starting Garage;
`init` currently embeds the gateway configuration but not the Garage configuration.

Garage has no bundled web console (unlike MinIO): create the bucket and an access key once, from
the host, after the service is up —

```bash
docker compose --profile optional-adapters up --detach object-storage
docker compose exec object-storage /garage status                       # note the node ID (first column)
docker compose exec object-storage /garage layout assign -z dc1 -c 1G <node-id>
docker compose exec object-storage /garage layout apply --version 1
docker compose exec object-storage /garage bucket create copalibre
docker compose exec object-storage /garage key create copalibre-key     # note the printed Key ID and Secret key
docker compose exec object-storage /garage bucket allow --read --write --owner copalibre --key copalibre-key
```

Set `COPALIBRE_OBJECT_STORAGE_ACCESS_KEY`/`_SECRET_KEY` in `.env` to the printed Key ID/Secret key,
then restart the application services so they pick up the new values.

## Persistent Data And Backups

`copalibre-data` contains filesystem-backed uploads when external object storage is not configured;
back it up separately from the PostgreSQL packet.

`postgres-data` contains authoritative tournament, participant, result, audit, outbox, identity,
and configuration records. `object-storage-meta` and `object-storage-data` exist only with the
`optional-adapters` profile (Garage's metadata and object bytes respectively) and hold uploaded
objects; back them up with PostgreSQL when the profile is enabled. `redis-data` is
non-authoritative and does not replace database or object backups.

Create a backup with `copalibre backup`. It writes a compressed packet (`.tar.gz`, PostgreSQL dump
plus a manifest recording when it was taken and which CopaLibre version produced it) to a
timestamped name under `backups/`, the only host path mounted into the Compose CLI container —
PostgreSQL client tools and credentials never need to be installed on host. `--retain <n>` (default 5) prunes packets beyond the `n` most recent after each successful backup, touching only files
matching this command's own packet naming pattern. Restore only into a clean target with
`copalibre restore --file backups/<packet>.tar.gz --confirm`; first use `--dry-run` to inspect the
non-secret plan. A scheduled restore drill validates the supported procedure — see "Recovering a
previous backup" below for what `restore` does after the data lands.

## Upgrading

Topology-specific procedures: [Caddy](deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy),
[NGINX](deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx), and
[Kubernetes/Helm](deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely).

### Automated upgrade with copalibre upgrade

The `copalibre` CLI coordinates the end-to-end upgrade lifecycle:

```bash
# Preview changes and check version/module compatibility without modifying services
copalibre upgrade --check

# Execute the automated upgrade (pulls images, reconciles Compose, runs migrations, verifies health)
copalibre upgrade
```

To upgrade only the CLI binary itself, run `copalibre upgrade --self`.

### Manual Compose upgrade to 1.2.6

Use this procedure after the target images have been published. Keep the existing installation
directory, Compose project name and named volumes; a new `init` directory is a separate installation,
not an upgrade. Retain the CLI matching `.copalibre/installation.json`: replacing the CLI does not
update that marker, the installed Compose files or image references. A mismatched CLI refuses
`migrate` and `upgrade-check`; do not delete or rewrite the marker to bypass this check.

This stop-the-world procedure does not guarantee a two-minute outage. For a two-minute maximum,
rehearse the full cutover with the same release, configuration and production-sized data, including
migration and post-upgrade health checks. Proceed only when the measured interruption has margin
under two minutes and the migration is verified compatible with the old and new application versions;
otherwise this upgrade plan does not meet that downtime limit. Do not skip migration or reopen traffic
against a partially upgraded database to fit the budget.

1. Record current image versions. Back up PostgreSQL with
   `copalibre backup --file backups/pre-upgrade.tar.gz`, and separately back up object storage,
   `.env`, signing keys, Compose files and gateway configuration. Verify recovery before cutover.
2. Review changes to Compose and deployment assets in the target release and apply required
   configuration changes to the existing installation. Preserve volume identities and secrets.
   For installations using MinIO, migrate objects to the configured replacement before switching
   storage endpoints; a PostgreSQL backup does not contain those objects.
3. Set **both** image references in `.env`:
   ```dotenv
   COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
   COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
   ```
4. Pull images and run the target runtime's compatibility check without starting dependencies:
   ```bash
   docker compose pull
   docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
   ```
   The check reports incompatible installed modules and pending migrations without applying them.
   Resolve failures before proceeding. Keep PostgreSQL running for this check.
5. Schedule downtime and stop processes that can write tournament state. Take a final backup
   before applying migrations, then restart only if migration succeeds:
   ```bash
   docker compose stop gateway web web-ssr api events worker scheduler
   copalibre backup --file backups/pre-upgrade.tar.gz
   docker compose run --rm migrate && docker compose up --detach --wait
   docker compose run --rm doctor
   ```
6. Verify login, a public tournament page, live events and the proxy check. Keep backups and
   previous release assets until the upgraded installation has been accepted.

Use the explicit Compose services for subsequent schema operations across versions; the new CLI
still cannot manage an old installation marker through version-sensitive commands. Helm deployments
use reviewed values, target image pins and the migration Job described in the
[Kubernetes guide](deployment/enterprise-kubernetes.md).

### Recovery if an upgrade fails

If compatibility fails before migration, restore the previous image pins and configuration;
the check itself has not changed the database. After a migration has run, **do not roll back by
selecting older images against the migrated database**. Keep application writers stopped, recover
the pre-upgrade PostgreSQL packet and matching object/configuration backups into an isolated target
running the previous release, then verify it before switching traffic. `copalibre restore` runs
that target release's migrations and schema checks, so use the matching CLI and runtime. Restore
replaces target data; changes made after the backup are not recovered. Preserve failed-upgrade
logs and backups while investigating.

### Personal Access Token security cutover

Before deploying repaired PAT authentication, invalidate credentials issued by the earlier path.
Run the dry run first, confirm its aggregate count, then execute the irreversible cutover using the
release image's database configuration:

```bash
docker compose run --rm --no-deps --entrypoint node api \
  apps/copalibre/dist/main.js revoke-legacy-personal-access-tokens --dry-run
docker compose run --rm --no-deps --entrypoint node api \
  apps/copalibre/dist/main.js revoke-legacy-personal-access-tokens --confirm
```

Record resulting count with deployment evidence. Only then deploy repaired PAT authentication;
users and integrations must create replacement credentials.

## Recovering A Previous Backup

`copalibre restore --file backups/<packet>.tar.gz --confirm` restores a packet made by
`copalibre backup`, then automatically finishes closing the loop with the code that is currently
running:

1. **Restore.** `pg_restore --clean --if-exists` replaces the target database with the packet's
   dump.
2. **Migrate.** `copalibre restore` runs the same migration step `docker compose up` already runs on
   every ordinary start (`copalibre migrate`, i.e. `docker compose run --rm migrate`) — forward-only,
   applying whatever migrations the restored data is missing to reach the schema this installation's
   code expects. If migration fails, `restore` reports the failure and exits non-zero without
   claiming success; re-run `copalibre migrate` to retry, then `copalibre doctor` to check the
   installation before serving traffic again.
3. **Verify.** `restore` then opens a database connection and confirms the applied schema version
   exactly matches what this code expects (`isSchemaReady`) — the same check `GET /ready` already
   uses to refuse traffic from a database it does not recognize. `restore` prints the concrete
   outcome instead of leaving that gap to be discovered later via a failing readiness probe.

**Restoring a backup taken by a newer CopaLibre than the one currently running is refused by
default.** The manifest records the producing version; if it is newer than this installation's own
version, `restore` stops before running `pg_restore` at all, naming both versions and pointing at the
fix: upgrade this installation to at least that version first (see "Upgrading" above), or pass
`--allow-newer-backup` to proceed anyway, eyes open, if that is genuinely what you intend (for
example, immediately upgrading the code right after this restore). Restoring an older or
same-version backup — the ordinary, supported case — always proceeds automatically.
