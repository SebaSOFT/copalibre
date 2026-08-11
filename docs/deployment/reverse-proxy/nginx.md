# NGINX reverse proxy

Example config: [`deploy/proxy/nginx.conf`](../../../deploy/proxy/nginx.conf).

## Setup

1. Replace `app.copalibre.example`, `api.copalibre.example`, and `events.copalibre.example` with your
   real host names.
2. Add TLS to each `server` block (the example listens on plain `:80` and documents where certificate
   directives belong) before exposing it publicly.
3. Copy the config into `conf.d/` (or wherever your NGINX installation includes site configs) and
   reload NGINX.

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
