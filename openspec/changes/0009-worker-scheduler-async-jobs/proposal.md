## Why

Phase `0005-api-auth-jwt-openapi-contract` and prior phases write domain mutations, audit records, and
transactional outbox entries in one database commit, but nothing yet consumes that outbox to derive
projections, and nothing enqueues or runs durable background work (exports, notifications, media
processing, recalculation). `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`
("One release, multiple process roles" and "Background work and scheduling") requires this to be an
explicit, durable, horizontally-scalable process boundary — not request-handler side effects —
because "user-facing requests do not hide unbounded media, webhook, notification, export, or
recalculation work" (architectural principle 6, "Asynchronous work is durable").

This phase implements `apps/worker` and `apps/scheduler`, the two process roles named in the
architecture doc's role table, and closes the loop from "domain transaction" to "projection is
recalculated and versioned" described in the doc's "Command and projection flow" section.

## What Changes

- Implement `apps/worker` as an **outbox relay**: claim unprocessed rows from the transactional
  outbox table (owned by `packages/persistence`, built in `0004-persistence-postgres-outbox-audit`),
  process them exactly-once from the consumer's perspective via idempotency keys, and advance a
  durable cursor.
- Implement **projection recalculation and versioning**: each processed event triggers a projection
  rebuild scoped to its affected aggregate, tagged with a monotonically increasing
  `projectionVersion`, ready for `apps/events` (a later phase) to broadcast.
- Implement **durable job semantics**: retry metadata (attempt count, next-attempt time), bounded
  exponential backoff, and a terminal **dead-letter** state that is inspectable (queryable, not
  silently dropped) — per "Backoff is bounded; terminal failures enter an inspectable dead-letter
  state."
- Implement `apps/scheduler` as a **periodic job enqueuer** using a **distributed PostgreSQL lease**
  so exactly one logical scheduler is active across any number of replicas — per "The scheduler only
  enqueues work and uses a distributed lease so horizontal deployments have one logical scheduler."
- Expose **operational metrics**: queue depth, oldest-pending-job age, retry count, failure rate —
  per the doc's minimum telemetry list.
- Leave the **concrete queue adapter an explicit open gate**: PostgreSQL outbox/job tables are the
  durable, authoritative source for this phase; Redis/BullMQ integration for derived throughput is
  out of scope here and, per the architecture doc, "is optional... and never authoritative."

## Capabilities

### New Capabilities
- `async-job-processing`: the platform durably processes outbox-derived and scheduled background
  work via `apps/worker` and `apps/scheduler`, with idempotent retry, bounded backoff, an
  inspectable dead-letter state, a single logical scheduler under horizontal scaling, and versioned
  projection recalculation.

### Modified Capabilities
(none — `apps/worker` and `apps/scheduler` do not yet exist; no prior capability's requirements change)

## Impact

- **New code**: `apps/worker` job-claim loop, retry/backoff policy, dead-letter inspection query;
  `apps/scheduler` lease-acquisition loop and periodic-job registration.
- **Depends on**: `0004-persistence-postgres-outbox-audit` (outbox table, transaction boundary) and
  `0001-bootstrap-monorepo-toolchain` (workspace scaffolding — `apps/worker`/`apps/scheduler` health
  endpoints already stubbed there, this phase gives them real behavior).
- **Consumed by**: `0010-realtime-sse-contract` (the `events` role reads the projection version this
  phase produces), and every later feature phase whose write path needs durable side effects
  (notifications, exports, media processing).
- **Open gate carried forward, not resolved here**: final selection of an optional cache/queue
  adapter (Redis/BullMQ) for derived throughput — see `design.md`.
