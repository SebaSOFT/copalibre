# Caddy reverse proxy

Example config: [`deploy/proxy/Caddyfile`](../../../deploy/proxy/Caddyfile).

## Setup

1. Point `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST`, and `COPALIBRE_EVENTS_HOST` at the public host
   names for the web, API, and SSE endpoints. Caddy terminates TLS at this layer — Docker Compose
   does not expose a public TLS listener of its own.
2. Set `ACME_EMAIL` so Caddy can request certificates automatically.
3. Copy the Caddyfile into place (or point Caddy's `--config` flag at it) and start Caddy in front of
   the running Compose installation.

The sample runs on the Compose network: the application hostname forwards to `gateway:80`,
which dispatches same-origin API, authentication, SSE and web requests. The separate API and events
hostnames remain available. A proxy running directly on the host must instead use the published
addresses (for example `127.0.0.1:8080` for the gateway, `127.0.0.1:3001` for API and
`127.0.0.1:3002` for events); Docker service names do not resolve on the host. Configure TLS at
this edge and set the installation's public URLs to match it.

## Upgrading CopaLibre behind Caddy

1. Save the active proxy configuration, TLS configuration and current application image versions.
   Follow [Self-hosting → Upgrading](../../self-hosting.md#upgrading) for the PostgreSQL/object
   backups, target-image compatibility check and migration sequence. Keep the current installation
   directory and Compose volumes; do not run a second `init` or delete volumes.
2. Put the edge on your maintenance backend during the application stop/migration interval. Drain
   active operations and SSE connections; do not expose requests to a partially upgraded stack.
   The proxy can stay running. Updating CopaLibre does not require updating the proxy image or
   certificates unless the target release changes that requirement.
3. Apply the application upgrade from the existing installation directory, with both runtime and
   web image pins changed together. Inspect migration and doctor results before reopening traffic.
4. If the release changes routes, compare the new proxy sample with your deployed configuration and
   retain your real hostnames, TLS settings and trusted-proxy allowlist. Use `gateway:80` only for
   a proxy on the Compose network; a host process uses the published gateway address. Do not copy
   a sample over a production config without preserving those settings.
5. Validate and reload **only if the proxy configuration changed**. Run inside the proxy container
   or on the host where that proxy actually runs, adapting the configuration path:
   ```bash
   caddy validate --config /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile
   ```
6. Verify the public HTTPS origin, login/refresh, a dynamic tournament page, and live updates.
   From the installation directory, check SSE through the application hostname too:
   ```bash
   copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
   ```
   Then remove maintenance routing. The expected SSE response is `text/event-stream`, with
   heartbeats arriving without buffering. Keep normal API/authentication routes on the app origin.

If only the proxy reload fails, keep its previous known-good configuration and diagnose the error.
If the application upgrade fails after migration, use the documented backup recovery procedure;
reverting proxy routes or old container tags does not roll back the database.

## SSE conformance

The `{$COPALIBRE_EVENTS_HOST}` block matches `/events/*` and sets `flush_interval -1`, which flushes
each SSE comment/event as Caddy receives it instead of buffering a batch. Without this, an idle
heartbeat sits in a buffer and the browser's `EventSource` treats the connection as dead. This is
exactly what `copalibre doctor --check-proxy` verifies (see below) — the flag exists because a proxy
that looks fine for ordinary HTTP traffic can still silently break SSE.

## Trusted-proxy allowlist

If this Caddy instance is the public edge itself — the default single-host Compose deployment — leave
the commented `trusted_proxies` block in the global options alone. Caddy has no upstream to trust in
that topology, and there's nothing to configure.

If you put another proxy or load balancer in front of Caddy (a cloud LB, Cloudflare, ...), uncomment
it and scope the CIDR to that proxy's actual address range:

```
{
  servers {
    trusted_proxies static 203.0.113.0/24
  }
}
```

Never leave this trusting an unscoped or overly broad range — an operator's proxy network is not
something CopaLibre can guess on their behalf, so the shipped example documents the requirement
rather than inventing a default. Getting this wrong lets a client spoof its own `X-Forwarded-For` and
appear to originate from inside your trusted network.

## What `copalibre doctor --check-proxy` verifies

Run `copalibre doctor --check-proxy --proxy-url <url-behind-this-proxy>` after Caddy is up. It checks:

- The SSE route responds with `content-type: text/event-stream`.
- `Cache-Control` includes `no-transform`.
- `X-Accel-Buffering: no` is present (harmless for Caddy, required if anything upstream is nginx-aware).
- The initial heartbeat arrives immediately, and a second heartbeat arrives before the idle timeout —
  proof buffering isn't silently swallowing the stream.

It does **not** verify the trusted-proxy allowlist directive itself; that's a static config review, not
something observable from one HTTP request. CI's `deployment-e2e`/`deploy-smoke-test` jobs run this
check against the real Caddyfile on every change (`.github/workflows/ci.yml`), and a unit test
(`apps/copalibre/src/reverse-proxy-configs.test.ts`) fails if the allowlist directive disappears from
the example file entirely.
