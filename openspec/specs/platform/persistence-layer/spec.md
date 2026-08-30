# persistence-layer Specification

## Purpose
Gives every domain mutation a durable, auditable, transactionally-consistent home in PostgreSQL,
and gives downstream consumers (workers, SSE) a reliable outbox to read from without ever
polling the domain tables directly.

## Requirements

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
timestamp, authorization context, previous state, resulting state, and reason where applicable. Every
refused attempt at such a mutation SHALL record an audit entry with actor, timestamp, authorization
context, what was attempted, and the reason it was refused — a refused attempt has no resulting state,
and its absence SHALL NOT be read as the attempt not having happened.

#### Scenario: Audit entry is queryable by aggregate
- **WHEN** an authorized user requests the audit history for a tournament aggregate
- **THEN** the system returns every recorded audit entry for that aggregate in chronological order, each with actor and timestamp

#### Scenario: A refused attempt appears in the aggregate's history
- **WHEN** an authorized user requests the audit history for an aggregate against which a change was
  attempted and refused
- **THEN** the refused attempt appears in that history, distinguishable from the changes that were
  applied

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

### Requirement: Profiles, bindings and materialised results are stored
The schema SHALL persist tournament profiles, resolved capability bindings, compiled effective
rulesets, and per-match materialised outcomes and standings.

#### Scenario: A compiled snapshot survives its source
- **WHEN** a compiled ruleset is written and the descriptor row it was compiled from is deleted
- **THEN** the compiled ruleset remains readable and complete

#### Scenario: Materialised standings are written within the finalising transaction
- **WHEN** a match is finalised
- **THEN** its outcome, the recomputed standings, the audit record and the outbox event commit together
  or roll back together

### Requirement: A refused attempt is recorded, not only a completed change
An operation refused on authorization, lifecycle state or mutation classification SHALL record who
attempted it, what they attempted, and why it was refused, in the same audit trail as the operations
that succeed.

A refusal record SHALL be written whether or not the caller receives an explanatory message, and its
absence SHALL be a defect rather than an accepted normal. Recording a refusal SHALL NOT change the
refusal: an operation that would be refused is still refused, and a failure while recording SHALL NOT
convert a refusal into a different outcome.

#### Scenario: A blocked mutation records who attempted it
- **WHEN** an operator attempts a change classified `blocked_after_results` and is refused
- **THEN** an audit entry records the actor, the operation attempted, and the classification that
  refused it

#### Scenario: An authorization refusal is recorded
- **WHEN** a request is refused because the caller's role does not permit it
- **THEN** an audit entry records the actor, the capability they lacked, and the resource scope

#### Scenario: A refusal caused by competition state is recorded
- **WHEN** a queued command is refused because its target match is no longer eligible
- **THEN** an audit entry records the attempt and the state that refused it, so the operator's work is
  traceable even though it was never applied

#### Scenario: Recording never rescues or worsens the outcome
- **WHEN** writing a refusal record fails
- **THEN** the original refusal is still returned to the caller unchanged, and the failure to record is
  reported through the installation's own error reporting rather than to the caller

### Requirement: Sensitive reads are recorded
Bulk extraction of data and reads of personal data SHALL record actor, scope and time. Ordinary
navigation SHALL NOT be recorded.

#### Scenario: An export is recorded
- **WHEN** an operator exports a tournament's configuration or downloads a participant data file
- **THEN** an audit entry records who exported what, and when

#### Scenario: A personal-data read is recorded
- **WHEN** a person's record carrying personal data is read
- **THEN** an audit entry records the actor and the person read

#### Scenario: Ordinary browsing is not recorded
- **WHEN** an operator opens a standings table or a bracket
- **THEN** no audit entry is written, because a trail that records every page view is one nobody reads

### Requirement: The audited action vocabulary is declared and enumerable
The set of audited actions SHALL be a declaration that can be enumerated, rather than string literals
distributed across the code that writes them. A repository method that mutates a domain aggregate
without recording an audit entry SHALL fail the build.

#### Scenario: The vocabulary can be listed
- **WHEN** the audited action vocabulary is requested
- **THEN** every action the system can record is enumerable from one declaration

#### Scenario: An unaudited aggregate mutation fails the build
- **WHEN** a repository method that mutates a domain aggregate records no audit entry
- **THEN** the build fails naming that method, rather than the omission being discovered by its absence
  from a trail later

#### Scenario: An undeclared action fails the build
- **WHEN** code records an audit action that the vocabulary does not declare
- **THEN** the build fails, so the trail's vocabulary cannot grow by accident
