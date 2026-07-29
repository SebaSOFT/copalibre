## Context

`0004-persistence-postgres-outbox-audit` writes domain mutation, audit record, and outbox event in one
transaction. Nothing yet consumes that outbox. See proposal.md for motivation; this document covers
how `apps/worker` and `apps/scheduler` consume it durably and how one logical scheduler is maintained
under horizontal scaling.

## Goals / Non-Goals

**Goals:**
- Outbox rows are eventually processed exactly-once from the consumer's perspective, even across
  worker crashes and redeliveries.
- Exactly one scheduler replica is logically active at any time, with automatic failover.
- Failure is visible (dead-letter, metrics), never silent.

**Non-Goals:**
- Selecting a concrete queue adapter (Redis/BullMQ) for derived throughput — explicitly an open gate
  (see below).
- Implementing the actual business jobs (notification delivery, export generation, media
  processing) — this phase builds the durable job-execution substrate; later feature phases register
  jobs onto it.
- `apps/events`' SSE emission of the recalculated projection — that is `0010-realtime-sse-contract`.

## Decisions

**PostgreSQL outbox/job tables are the durable source of truth; no external queue in this phase.**
`copalibre-platform-architecture.md`: "The concrete queue adapter is not selected; the durability
contract is selected... PostgreSQL outbox is the durable work source. Redis/BullMQ is optional for
derived throughput or third-party side effects and is never authoritative." Alternative considered:
adopt BullMQ+Redis now for throughput — rejected for this phase because it would make Redis load-
bearing before the doc's own gate is resolved; a `packages/persistence`-backed claim query (`SELECT
... FOR UPDATE SKIP LOCKED`) is sufficient at MVP scale and keeps the durability guarantee entirely
inside PostgreSQL's transactional boundary.

**Lease-based scheduler, not a cron sidecar.** A `SELECT ... FOR UPDATE SKIP LOCKED`-style lease row
in PostgreSQL, renewed on a heartbeat and expiring on replica failure, avoids introducing a second
coordination system (e.g. etcd/Consul) purely to elect one scheduler. Alternative considered: run a
single non-replicated scheduler instance — rejected because it violates architectural principle 2
("one release, multiple roles... independently scalable") and creates a single point of failure with
no automatic failover.

**Idempotency key derived from the outbox row, not job payload hashing.** The outbox row's own
primary key (UUIDv7) is the idempotency key; a processed-markers table records which keys have been
applied. This is simpler and cheaper than content-hashing arbitrary payloads and matches the
"actor, timestamp... reason" audit-trail discipline used elsewhere in the architecture.

## Risks / Trade-offs

- [Risk] `SELECT ... FOR UPDATE SKIP LOCKED` polling adds load to PostgreSQL as job volume grows. →
  Mitigation: this phase's design explicitly names Redis/BullMQ as the documented escape hatch for
  derived throughput once measured load justifies it — not a redesign, an additive adapter.
- [Risk] Dead-lettered jobs accumulate unnoticed if no one watches the metrics. → Mitigation: the
  dead-letter inspection query is a first-class requirement (see spec), not an afterthought; wiring
  it into an alerting surface is deployment-phase scope (`0021-deployment-docker-compose-cli`).
- [Risk] Lease-timeout tuned too aggressively causes two replicas to briefly both believe they hold
  the lease. → Mitigation: require lease renewal well inside the timeout window (e.g. renew at 1/3
  of timeout) and make enqueue operations themselves idempotent as a second line of defense.

## Open Questions

- Exact lease timeout and retry-backoff curve constants are left to the implementation (`tasks.md`
  task in Implementation) — tunable without changing this spec or the chosen approach.
