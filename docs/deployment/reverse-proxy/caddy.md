# Caddy reverse proxy

Example config: [`deploy/proxy/Caddyfile`](../../../deploy/proxy/Caddyfile).

## Setup

1. Point `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST`, and `COPALIBRE_EVENTS_HOST` at the public host
   names for the web, API, and SSE endpoints. Caddy terminates TLS at this layer — Docker Compose
   does not expose a public TLS listener of its own.
2. Set `ACME_EMAIL` so Caddy can request certificates automatically.
3. Copy the Caddyfile into place (or point Caddy's `--config` flag at it) and start Caddy in front of
   the running Compose installation.

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
