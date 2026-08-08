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

## Persistent Data And Backups

`postgres-data` contains authoritative tournament, participant, result, audit, outbox, identity,
and configuration records. `object-storage-data` exists only with the `optional-adapters` profile
and holds uploaded objects; back it up with PostgreSQL when it is enabled. `redis-data` is
non-authoritative and does not replace database or object backups.

Create a backup with `./copalibre backup`. It writes a compressed packet (`.tar.gz`, PostgreSQL dump
plus a manifest recording when it was taken and which CopaLibre version produced it) to a
timestamped name under `backups/`, the only host path mounted into the Compose CLI container —
PostgreSQL client tools and credentials never need to be installed on host. `--retain <n>` (default
5) prunes packets beyond the `n` most recent after each successful backup, touching only files
matching this command's own packet naming pattern. Restore only into a clean target with
`./copalibre restore --file backups/<packet>.tar.gz --confirm`; first use `--dry-run` to inspect the
non-secret plan. A scheduled restore drill validates the supported procedure.

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
