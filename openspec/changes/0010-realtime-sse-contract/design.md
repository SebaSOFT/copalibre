## Context

`0009-worker-scheduler-async-jobs` recalculates versioned projections and persists a durable event
cursor. Nothing yet delivers those live to a browser. See proposal.md for motivation; this document
covers the SSE protocol implementation, authenticated-stream mechanics, and reconnection semantics.

## Goals / Non-Goals

**Goals:**
- Public and authenticated clients receive live projection updates with no missed authoritative
  state across a disconnect within the replay window.
- Authenticated streams never expose a bearer token in a URL, proxy log, or browser history.
- The same public SSE channel is reusable by every later public-facing surface (public web, TV/
  broadcast) without a second channel per surface.

**Non-Goals:**
- WebSocket transport — explicitly deferred per the architecture doc's open gates; this phase does
  not re-evaluate that decision.
- The actual public/control UI consuming these streams — that is `0012-public-web-astro-shell`,
  `0013-public-live-and-bracket-surfaces`, `0014-control-web-shell-and-org-dashboard`, and
  `0022-broadcast-venue-tv-surfaces`.
- The device-scoped display-token mechanism for unattended TV/venue screens — that authentication
  variant is designed in `0022-broadcast-venue-tv-surfaces`; this phase's authenticated path is
  person-JWT only.

## Decisions

**SSE over Fetch streaming for authenticated clients, not native `EventSource`.** Native
`EventSource` cannot set an `Authorization` header, and CopaLibre's JWT contract holds the access
token in memory, never a cookie (see `0005-api-auth-jwt-openapi-contract`). Fetch's `ReadableStream`
response body can be parsed as SSE wire format manually while still sending the bearer header.
Alternative considered: pass the token as a query parameter — explicitly rejected by the source
architecture doc for leaking into proxy logs, browser history, and error reports.

**Cursor durability lives in PostgreSQL, not in-memory per-connection state.** Reusing
`packages/persistence`'s durable event cursor (already required for outbox processing in
`0009-worker-scheduler-async-jobs`) means a client can reconnect to *any* `apps/events` replica — not
necessarily the one it was originally connected to — and still resume correctly. This is required by
architectural principle 7, "API nodes are horizontally stateless."

**One shared public SSE channel for public web, public bracket views, and TV/broadcast surfaces.**
The architecture doc is explicit: "Reuse the public SSE channel for this surface; the underlying
data is the same published projection, only the rendering differs, so a second event channel is
unnecessary complexity." This phase builds the channel generically enough (curated payload, not
route-specific) that `0022-broadcast-venue-tv-surfaces` does not need a new endpoint, only a new consumer.

**Long-polling fallback shares cursor/replay semantics with SSE, implemented as a thin wrapper.**
Rather than a parallel implementation, the long-poll handler calls the same replay-resolution logic
SSE reconnection uses, bounded by the `wait` parameter — this avoids two divergent definitions of
"replay window."

## Risks / Trade-offs

- [Risk] Reverse proxies that buffer responses will silently break SSE delivery (events arrive in
  bursts or not at all). → Mitigation: this is explicitly a `0021-deployment-docker-compose-cli`
  concern (`copalibre doctor` proxy conformance checks) but this phase's tasks include a
  proxy-buffering integration test using a representative reverse-proxy config so the failure mode
  is caught before deployment phase.
- [Risk] Replay window sized too small causes unnecessary full-projection refetches under normal
  network blips; too large risks unbounded memory/storage for cursor history. → Mitigation: replay
  window is a tunable configuration value, documented and covered by an integration test at both
  edges (just-within vs. just-outside the window).
- [Risk] Per-IP connection limits applied too aggressively could block legitimate venues/kiosks
  sharing a NAT'd IP. → Mitigation: `0022-broadcast-venue-tv-surfaces` uses the authenticated
  device-scoped path (not the public path) precisely to avoid this; document that guidance in this
  phase's proposal for the later phase to pick up.

## Migration Plan

N/A — `apps/events` has no prior authoritative state; this is new capability, not a change to
existing behavior. Rollout is gated by CI (this phase's own tests) before any consuming UI phase
depends on it.
