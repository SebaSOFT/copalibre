# async-job-processing Specification

## Purpose
Guarantees background work derived from authoritative domain transactions (projection recalculation,
notifications, exports, media processing) runs durably, exactly-once from the consumer's
perspective, and recovers from failure without silent data loss, even under horizontal scaling.
## Requirements
### Requirement: Outbox-driven job consumption
`apps/worker` SHALL claim unprocessed transactional-outbox rows and process each exactly once from
the consumer's perspective, using an idempotency key so a redelivered event does not duplicate its
effect.

#### Scenario: Duplicate delivery does not duplicate effect
- **WHEN** the same outbox row is claimed twice (e.g. after a worker crash mid-processing)
- **THEN** the second processing attempt detects the idempotency key was already applied and performs no duplicate side effect

#### Scenario: Worker crash does not lose an event
- **WHEN** a worker process crashes after claiming a row but before committing its processed state
- **THEN** the row becomes claimable again after a bounded lease timeout and is eventually processed

### Requirement: Versioned projection recalculation
Processing an outbox event SHALL recalculate the affected projection and tag the result with a
monotonically increasing `projectionVersion` scoped to that projection.

#### Scenario: Projection version increases on update
- **WHEN** two outbox events affecting the same projection are processed in sequence
- **THEN** the second processed projection's `projectionVersion` is strictly greater than the first's

### Requirement: Bounded retry with inspectable dead-letter state
A job that fails processing SHALL retry with bounded exponential backoff up to a configured attempt
limit, after which it SHALL enter a dead-letter state that is queryable by an operator, never
silently dropped.

#### Scenario: Job exhausts retries
- **WHEN** a job fails processing on every attempt up to the configured limit
- **THEN** the job is marked dead-lettered and appears in the dead-letter inspection query with its failure history

#### Scenario: Dead-lettered job is not retried automatically
- **WHEN** a job is in the dead-letter state
- **THEN** no automatic retry occurs; only an explicit operator action re-enqueues it

### Requirement: Single logical scheduler under horizontal scaling
`apps/scheduler` SHALL use a distributed PostgreSQL lease so that, regardless of how many
`scheduler` replicas are running, exactly one replica actively enqueues periodic work at any time.

#### Scenario: Multiple scheduler replicas run without duplicate enqueue
- **WHEN** three `apps/scheduler` replicas are running concurrently
- **THEN** a periodic job scheduled to enqueue once per interval is enqueued exactly once per interval, not up to three times

#### Scenario: Lease holder failure hands off cleanly
- **WHEN** the replica currently holding the scheduler lease stops responding
- **THEN** another replica acquires the lease within the documented lease timeout and resumes enqueueing

### Requirement: Operational metrics for async work
The system SHALL expose queue depth, oldest-pending-job age, retry count, and failure rate as
observable operational metrics.

#### Scenario: Metrics reflect a growing backlog
- **WHEN** jobs are enqueued faster than `apps/worker` processes them
- **THEN** the exposed queue-depth and oldest-pending-job-age metrics increase accordingly

