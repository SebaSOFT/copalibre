## Purpose

Gives every domain mutation a durable, auditable, transactionally-consistent home in PostgreSQL,
and gives downstream consumers (workers, SSE) a reliable outbox to read from without ever
polling the domain tables directly.

## ADDED Requirements

### Requirement: Snake_case relational schema mapped from camelCase domain types
The persistence layer SHALL expose every domain aggregate through snake_case tables and columns
while the domain and API layers use camelCase, per the naming-conventions decision.

#### Scenario: Column names never leak camelCase
- **WHEN** the schema is inspected via `information_schema.columns`
- **THEN** every column and table name is snake_case

### Requirement: UUIDv7 primary keys
Every table SHALL use UUIDv7 as its primary key type; UUIDv4 and ULID SHALL NOT be used.

#### Scenario: New row receives a UUIDv7 key
- **WHEN** a repository inserts a new aggregate row without an explicit id
- **THEN** the generated id is a valid UUIDv7 (version bits and monotonic-ish timestamp prefix)

### Requirement: Domain mutation, audit record, and outbox event share one transaction
Any operation that mutates a domain aggregate SHALL write its domain change, its audit record, and
its transactional outbox event in the same database transaction.

#### Scenario: Outbox row exists whenever an audited mutation commits
- **WHEN** a repository method commits a mutation that produces an audit record
- **THEN** a corresponding outbox row exists in the same transaction and is visible to readers only after commit

#### Scenario: Rollback discards all three together
- **WHEN** the transaction wrapping a domain mutation is rolled back
- **THEN** neither the domain row, the audit record, nor the outbox event persist

### Requirement: Audit record captures actor, timestamp, and state transition
Every mutation that changes a published result or schedule SHALL record an audit entry with actor,
timestamp, authorization context, previous state, resulting state, and reason where applicable.

#### Scenario: Audit entry is queryable by aggregate
- **WHEN** an authorized user requests the audit history for a tournament aggregate
- **THEN** the system returns every recorded audit entry for that aggregate in chronological order, each with actor and timestamp

### Requirement: Controlled migration entrypoint
Schema migrations SHALL apply only through `apps/migrate`, run as one controlled job per release,
never automatically inside `apps/api` or `apps/worker` startup.

#### Scenario: API startup does not run migrations
- **WHEN** `apps/api` starts against a database with pending migrations
- **THEN** it fails its readiness check rather than silently applying schema changes

#### Scenario: Migrate applies pending migrations idempotently
- **WHEN** `apps/migrate` runs twice in a row with no new migrations between runs
- **THEN** the second run is a no-op and exits successfully

### Requirement: Repositories are the only persistence access path
No package or app other than `packages/persistence` SHALL issue direct SQL against the domain
schema; all reads and writes go through typed repositories.

#### Scenario: Repository enforces the aggregate's invariants before writing
- **WHEN** a repository is asked to persist a domain aggregate that fails a phase-2 invariant
- **THEN** the write is rejected before any row is inserted or updated
