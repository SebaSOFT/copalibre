## Why

`0009-worker-scheduler-async-jobs` produces versioned projections and durable event cursors, but nothing
yet delivers them live to public spectators or authenticated operators. `../chaos-vault/
20-knowledge-domains/copalibre-platform-architecture.md`'s "Server-Sent Events contract" section
mandates SSE as "the preferred live transport for standings, schedules, match updates,
notifications, job progress, and public projections," explicitly deferring WebSocket "until the
product demonstrates a bidirectional high-frequency requirement." This phase implements `apps/events`
and the shared client library that both the public web and control web surfaces (later phases) will
consume.

## What Changes

- Implement `apps/events` public stream: `GET /events/public/{organization}/tournaments/{tournament}`
  with `Accept: text/event-stream`, returning `Content-Type: text/event-stream`,
  `Cache-Control: no-cache, no-transform`.
- Implement the durable event envelope with fields `eventId, organizationId, stream, entityId,
  eventType, projectionVersion, createdAt, payload` in camelCase (API/wire casing rule), mapped from
  the `packages/persistence` outbox table's snake_case columns (`event_id, organization_id,
  entity_id, event_type, projection_version, created_at`).
- Implement **cursor-based reconnection**: a client reconnects with `Last-Event-ID`; the server
  either replays from the durable cursor or instructs the client to fetch a complete current
  projection when the replay window has expired.
- Implement **authenticated SSE via Fetch streaming**, not native `EventSource` — per the doc,
  "Native browser `EventSource` cannot add an arbitrary `Authorization` header. Authenticated clients
  therefore use Fetch response streaming while preserving the SSE wire format," at
  `GET /events/control/{organizationAlias}` with `Authorization: Bearer <JWT>` and `Last-Event-ID`
  headers.
- Implement the **shared client library** (used by both public and control web, later phases) owning
  parsing, reconnection, exponential backoff, heartbeat handling, cursor persistence, access-token
  renewal, abort behavior, and recoverable/fatal error classification.
- Implement the **long-polling fallback**: `GET /api/events?after=<cursor>&wait=<seconds>` with the
  same authorization, cursor, replay, and projection semantics as SSE, for incompatible proxies/networks.
- Enforce: **never place an access or refresh token in an SSE URL query string** — the doc is
  explicit that "URLs leak into proxy logs, browser history, metrics, traces, screenshots, and error
  reports."
- Public streams apply per-IP and per-resource limits, connection caps, bounded replay, and abuse
  controls, exposing only sanitized public projections.
- **Explicitly out of scope / open gate**: WebSocket transport remains deferred, per the doc's own
  "Explicit non-decisions and open gates" list — this phase does not revisit that decision.

## Capabilities

### New Capabilities
- `realtime-events`: the platform delivers public and authenticated live updates over Server-Sent
  Events with durable cursor-based replay, a Fetch-streaming authenticated client path, a
  long-polling fallback, and a shared reconnect/backoff client library, without ever exposing a
  bearer token in a URL.

### Modified Capabilities
(none)

## Impact

- **New code**: `apps/events` (public + authenticated SSE controllers, replay-cursor resolution
  against `packages/persistence`'s durable cursor), shared SSE client package (consumed by
  `0012-public-web-astro-shell` and `0014-control-web-shell-and-org-dashboard`, both later phases).
- **Depends on**: `0009-worker-scheduler-async-jobs` (versioned projections and durable cursors),
  `0005-api-auth-jwt-openapi-contract` (JWT validation reused for the authenticated stream).
- **Consumed by**: every later public/control screen phase that shows live data (`public-live-and-
  bracket-surfaces`, `0017-live-match-console-a4`, `0022-broadcast-venue-tv-surfaces`, which reuses this same
  public SSE channel rather than adding a second channel per the architecture doc).
