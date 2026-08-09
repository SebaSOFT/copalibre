# Self-Hosting CopaLibre

Run `./copalibre init` once from a release checkout. It writes non-secret local defaults to
`.env` and lists values that must be supplied by the operator. Set a strong PostgreSQL password,
an opaque `COPALIBRE_BOOTSTRAP_TOKEN`, OIDC JWKS/issuer/audience values, the public browser client ID,
and one supported email provider configuration. Then run `./copalibre start` or
`docker compose up --detach --wait`.

`docker-compose.yml` intentionally does not terminate TLS. Put Caddy or NGINX at the public edge:
route ordinary API traffic to `api:3001`, SSE traffic to `events:3002`, and static control/public
web traffic to `web:4321`. The proxy must preserve forwarding headers, keep SSE unbuffered, and
allow idle streams to survive heartbeats. Use `deploy/proxy/Caddyfile` or
`deploy/proxy/nginx.conf` as the edge configuration, then verify its live address with
`./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

## Organization Language And Timezone

Every organization carries a `primaryLanguage` (one of `en`, `es`, `fr`, `pt`, `it`, `de`, `ru`) and
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

The help site (`/help/`) now defaults to English, with the same content also available at `/es/`;
generated `llms.txt`/`llms-full.txt` stay English regardless of how many interface languages the
site later supports.

## Persistent Data And Backups

`postgres-data` contains authoritative tournament, participant, result, audit, outbox, identity,
and configuration records. `object-storage-data` exists only with the `optional-adapters` profile
and holds uploaded objects; back it up with PostgreSQL when it is enabled. `redis-data` is
non-authoritative and does not replace database or object backups.

Create a backup with `./copalibre backup`. It writes a compressed packet (`.tar.gz`, PostgreSQL dump
plus a manifest recording when it was taken and which CopaLibre version produced it) to a
timestamped name under `backups/`, the only host path mounted into the Compose CLI container —
PostgreSQL client tools and credentials never need to be installed on host. `--retain <n>` (default 5) prunes packets beyond the `n` most recent after each successful backup, touching only files
matching this command's own packet naming pattern. Restore only into a clean target with
`./copalibre restore --file backups/<packet>.tar.gz --confirm`; first use `--dry-run` to inspect the
non-secret plan. A scheduled restore drill validates the supported procedure — see "Recovering a
previous backup" below for what `restore` does after the data lands.

## Upgrading

Non-destructive sequence: back up (`./copalibre backup`), update the checkout or image reference to
the new version without restarting anything yet, then run
`./copalibre upgrade-check --target-version <new-version>` against it. `upgrade-check` reports any
installed module whose declared `requiresCopalibre` range would no longer be satisfied by the target
version (the same check `module verify` runs against the version currently running) and lists
pending database migrations without applying them, exiting non-zero on any module incompatibility.
Once it passes, restart with the new version — migrations apply automatically, forward-only, before
any process role starts serving traffic (`docker-compose.yml`'s `migrate` service gates every other
role via `depends_on: condition: service_completed_successfully`).

## Recovering A Previous Backup

`./copalibre restore --file backups/<packet>.tar.gz --confirm` restores a packet made by
`./copalibre backup`, then automatically finishes closing the loop with the code that is currently
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
