# NGINX reverse proxy

Example config: [`deploy/proxy/nginx.conf`](../../../deploy/proxy/nginx.conf).

## Setup

1. Replace `app.copalibre.example`, `api.copalibre.example`, and `events.copalibre.example` with your
   real host names.
2. Add TLS to each `server` block (the example listens on plain `:80` and documents where certificate
   directives belong) before exposing it publicly.
3. Copy the config into `conf.d/` (or wherever your NGINX installation includes site configs) and
   reload NGINX.

The sample runs on the Compose network: the application hostname forwards to `gateway:80`,
which dispatches same-origin API, authentication, SSE and web requests. The separate API and events
hostnames remain available. A proxy running directly on the host must instead use the published
addresses (for example `127.0.0.1:8080` for the gateway, `127.0.0.1:3001` for API and
`127.0.0.1:3002` for events); Docker service names do not resolve on the host. Configure TLS at
this edge and set the installation's public URLs to match it.

## Upgrading CopaLibre behind NGINX

The maintenance-backend procedure below can exceed two minutes. If two minutes is a hard maximum,
rehearse the complete release cutover with production-sized data and require measured margin below
that limit before scheduling it. Keep traffic on the old release during preflight; proceed with a
rolling cutover only when the release migration is verified compatible with both old and new
application versions. If rehearsal cannot meet the limit, this upgrade plan is not suitable for that
window. Do not reopen traffic to a partially upgraded stack.

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
   nginx -t && nginx -s reload
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

The `events.copalibre.example` block sets `proxy_buffering off`, `proxy_cache off`, and
`X-Accel-Buffering: no`, and raises `proxy_read_timeout` to `3600s`. NGINX buffers proxied responses by
default, which is exactly wrong for a stream an idle heartbeat has to reach the browser through — a
buffered SSE connection looks alive until it silently times out. This is what
`copalibre doctor --check-proxy` verifies (see below); CI also runs a deliberately-buffered NGINX
profile against the same check specifically to prove it fails when buffering is on
(`docker-compose.proxy-test.yml`'s `nginx-buffered` profile).

## Trusted-proxy allowlist

If this NGINX instance is the public edge itself — the default single-host Compose deployment — leave
`set_real_ip_from`/`real_ip_header` commented out. NGINX has no upstream to trust in that topology.

If you put another proxy or load balancer in front of NGINX (a cloud LB, Cloudflare, ...), uncomment
both directives in every `server` block (or once in your `http` block, if this file is included inside
one) and scope `set_real_ip_from` to that proxy's actual address range:

```
set_real_ip_from 203.0.113.0/24;
real_ip_header X-Forwarded-For;
```

Never leave this trusting an unscoped or overly broad range — an operator's proxy network is not
something CopaLibre can guess on their behalf, so the shipped example documents the requirement rather
than inventing a default. Getting this wrong lets a client spoof its own `X-Forwarded-For` and appear
to originate from inside your trusted network.

## What `copalibre doctor --check-proxy` verifies

Run `copalibre doctor --check-proxy --proxy-url <url-behind-this-proxy>` after NGINX is up. It checks:

- The SSE route responds with `content-type: text/event-stream`.
- `Cache-Control` includes `no-transform`.
- `X-Accel-Buffering: no` is present.
- The initial heartbeat arrives immediately, and a second heartbeat arrives before the idle timeout.

It does **not** verify the trusted-proxy allowlist directive itself; that's a static config review, not
something observable from one HTTP request. CI's `deployment-e2e`/`deploy-smoke-test` jobs run this
check against the real config (both the conformant and the deliberately-buffered profile) on every
change (`.github/workflows/ci.yml`), and a unit test
(`apps/copalibre/src/reverse-proxy-configs.test.ts`) fails if the allowlist directives disappear from
the example file entirely.
