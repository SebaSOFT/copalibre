## Why

Phase 2 (`0002-domain-model-core`) and phase 3 (`0003-rules-engine-neuron-js-adapter`) define CopaLibre's
domain types and decision logic as framework-free TypeScript with no notion of storage. Nothing can
persist, audit, or reliably notify downstream consumers of a change yet. `../chaos-vault/
20-knowledge-domains/copalibre-platform-architecture.md` ("Backend, runtime, and package
management" and "Stateful core and data authority" sections) already decided the persistence
approach — PostgreSQL via `pg` + Kysely, not a full ORM, with an explicit rule: "do not make ORM
lifecycle hooks the source of tournament integrity." This phase builds `packages/persistence` to
that decision so every later phase (5 onward) can write domain mutations, audit records, and
outbox events through one reviewed transaction boundary instead of inventing its own.

## What Changes

- Add **Kysely** (`pg` driver) as the sole SQL access layer; no ORM, no active-record models.
- Add a **migration runner** and `apps/migrate` as the one controlled entrypoint that applies it —
  per the architecture doc's "One release, multiple process roles" table, `migrate` runs "one
  controlled job per release," never automatically inside `api`/`worker` startup.
- Define the **snake_case relational schema** mapping phase 2's camelCase domain types: tenants,
  identities, coarse roles/policy inputs, domain aggregates and versioned configuration, immutable
  or append-oriented operational facts, audit records, transactional outbox records, durable event
  cursors, projection version/publication metadata — the exact list from "Stateful core and data
  authority."
- Add **UUIDv7 primary keys** across every table (never UUIDv4/ULID), per the naming-conventions
  decision.
- Add the **audit log** table and write path: every mutating operation records actor, timestamp,
  authorization context, previous state, resulting state, and reason where it changes a published
  result or schedule.
- Add the **transactional outbox** table and write path: "Write domain mutation, audit record, and
  outbox event in one database transaction" (Background work and scheduling section). Outbox rows
  store the same facts the SSE contract (phase 10) will later emit — `event_id`, `organization_id`,
  `entity_id`, `event_type`, `projection_version`, `created_at` in snake_case — `packages/
  persistence` owns the camelCase-wire-to-snake_case-column mapping, per the SSE contract section's
  explicit note.
- Add **repositories** per domain aggregate (Organization, Tournament, Ruleset hierarchy,
  Participant/Team/Roster, Stage/Fixture/Match, Event log) as the only write/read path into
  Postgres — no other package or app queries the database directly.
- Explicit non-goal for this phase: no HTTP surface. `apps/api` (phase 5) is the first consumer of
  these repositories.

## Capabilities

### New Capabilities
- `persistence-layer`: PostgreSQL-backed repositories, transactional outbox, and audit trail for
  CopaLibre's domain aggregates, with a single controlled migration entrypoint.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `packages/persistence/{schema,migrations,repositories,audit,outbox}/`,
  `apps/migrate/` (real implementation, replacing phase 1's stub).
- **Dependencies introduced**: `pg`, `kysely`, a UUIDv7 generation library.
- **Depends on**: phase 2 (`0002-domain-model-core`) for the aggregate shapes being persisted; phase 1
  (`0001-bootstrap-monorepo-toolchain`) for the `docker-compose.dev.yml` Postgres service used by
  integration tests.
- **Unblocks**: phase 5 (`0005-api-auth-jwt-openapi-contract`), phase 8 (`live-match-operations-
  result-authority`), phase 9 (`0009-worker-scheduler-async-jobs`) — all read/write through these
  repositories rather than touching Postgres directly.
