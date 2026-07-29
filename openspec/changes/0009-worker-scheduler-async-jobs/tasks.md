## 1. Outbox relay (apps/worker)

- [ ] 1.1 Implement `SELECT ... FOR UPDATE SKIP LOCKED`-based outbox-row claim query against `packages/persistence`'s outbox table
- [ ] 1.2 Implement per-row idempotency-marker check/write so a redelivered row is a no-op on second processing
- [ ] 1.3 Implement claim-lease timeout so a crashed worker's claimed rows become claimable again
- [ ] 1.4 Implement job dispatch to the correct handler by `eventType`

## 2. Retry, backoff, dead-letter

- [ ] 2.1 Implement attempt counter and next-attempt-time fields on the job/outbox row
- [ ] 2.2 Implement bounded exponential backoff policy
- [ ] 2.3 Implement dead-letter transition on exhausted retries, retaining full failure history
- [ ] 2.4 Implement an operator-facing dead-letter inspection query/endpoint
- [ ] 2.5 Implement explicit manual re-enqueue action for a dead-lettered job (no automatic retry)

## 3. Projection recalculation and versioning

- [ ] 3.1 Implement projection rebuild scoped to the affected aggregate on successful job processing
- [ ] 3.2 Implement monotonically increasing `projectionVersion` per projection
- [ ] 3.3 Persist the durable event cursor alongside the recalculated projection

## 4. Scheduler distributed lease (apps/scheduler)

- [ ] 4.1 Implement PostgreSQL lease-row acquisition with heartbeat renewal
- [ ] 4.2 Implement lease-expiry-triggered handoff to another replica
- [ ] 4.3 Implement periodic-job registration API used by later feature phases to schedule recurring work
- [ ] 4.4 Enforce renewal well inside the timeout window (e.g. 1/3) to avoid dual-lease windows

## 5. Operational metrics

- [ ] 5.1 Expose queue depth metric
- [ ] 5.2 Expose oldest-pending-job age metric
- [ ] 5.3 Expose retry count and failure rate metrics

## 6. Unit tests

- [ ] 6.1 Backoff-curve calculation unit tests (attempt N -> expected delay)
- [ ] 6.2 Idempotency-marker check logic unit tests
- [ ] 6.3 Lease-acquisition state-machine unit tests (acquire, renew, expire, handoff)

## 7. Integration tests

- [ ] 7.1 Integration test: duplicate outbox-row claim does not duplicate side effect (real Postgres)
- [ ] 7.2 Integration test: worker crash mid-processing, row becomes claimable again after lease timeout, is eventually processed
- [ ] 7.3 Integration test: job exhausts retries and appears in dead-letter inspection query
- [ ] 7.4 Integration test: three concurrent scheduler replicas enqueue a periodic job exactly once per interval, not up to three times
- [ ] 7.5 Integration test: lease-holder replica stops responding, another replica acquires the lease within the documented timeout and resumes enqueueing
- [ ] 7.6 Integration test: projection version strictly increases across two sequential events on the same projection

## 8. CI wiring

- [ ] 8.1 Add a `unit-tests` step for `apps/worker` and `apps/scheduler` to the existing `.github/workflows/ci.yml` (extends the `unit-tests` job introduced by prior phases, or adds it if this is the first phase with real unit tests)
- [ ] 8.2 Add an `integration-tests` job to `.github/workflows/ci.yml` that starts the `postgres` service from `docker-compose.dev.yml` and runs this phase's integration tests, including the multi-replica scheduler test
