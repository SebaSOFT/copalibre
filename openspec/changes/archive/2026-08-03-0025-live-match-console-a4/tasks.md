## 1. Implementation: authoritative match-control contracts

- [x] 1.1 Define console-projection DTOs and a protected match-control read endpoint for authoritative state, descriptor presentation metadata, eligible attribution data, and granted capabilities
- [x] 1.2 Extend domain and persistence state to derive resolved score/statistics, active segment, elapsed time, event history, and active timers for the console projection
- [x] 1.3 Implement audited, capability-scoped manual clock adjustment and segment-selection commands
- [x] 1.4 Implement audited, capability-scoped timer-resolution commands limited to discipline-declared resolution paths
- [x] 1.5 Permit active `admin` and `referee` identities through match-control organization access, while retaining independent assignment checks for every match capability
- [x] 1.6 Add persistent, transactional `Idempotency-Key` handling for finalization, including request fingerprint conflict detection and replayed responses
- [x] 1.7 Publish versioned authoritative match projections through the durable outbox after every console mutation and extend the authenticated SSE contract
- [x] 1.8 Regenerate OpenAPI and generated client contracts for all console endpoints and event payloads

## 2. Implementation: live match console

- [x] 2.1 Create the authenticated `/control/{organization}/tournaments/{tournament}/matches/{match}` React route and load its initial authoritative console projection
- [x] 2.2 Build circular SVG match-clock progress ring, live scoreboard header, LIVE status badge, and stale-data indicator from projection state
- [x] 2.3 Build authorized manual clock adjustment and active-period selection flow
- [x] 2.4 Render event palette from active `DisciplineDescriptor` presentation metadata and filter it by current state, actor, and segment
- [x] 2.5 Implement conditional event workflow and final event form with side, eligible person, permitted staff, and optional description fields
- [x] 2.6 Render active timers as visible objects and expose only their declared, authorized resolution actions
- [x] 2.7 Build chronological, period-aware Event Ledger with category filters and a plain-text log-note footer with no command-execution semantics
- [x] 2.8 Build telemetry tiles from measured sources and explicit unavailable states; never render synthetic operational metrics
- [x] 2.9 Build destructive `.cl-inline-alert` finalize dialog, generate one idempotency key per attempt, and guard submission pending server response
- [x] 2.10 Apply optimistic mutations, reconcile them with newer authoritative SSE projections, and refetch after the bounded reconciliation timeout
- [x] 2.11 Hide or disable unavailable controls based on the returned match capabilities while retaining server-side enforcement

## 3. Unit tests

- [x] 3.1 Unit test console-projection derivation, including elapsed time, event history, timers, and capability output
- [x] 3.2 Unit test clock/segment and timer-resolution validation against fixture discipline descriptors
- [x] 3.3 Unit test event-palette filtering and conditional event-workflow branching
- [x] 3.4 Unit test idempotency-key generation and client reconciliation state transitions
- [x] 3.5 Unit test telemetry unavailable rendering without placeholder values

## 4. Integration tests

- [x] 4.1 Integration test protected console projection versus sanitized public match reads
- [x] 4.2 Integration test a referee with an assigned capability succeeds while an unassigned referee and an inactive user are rejected
- [x] 4.3 Integration test clock adjustment and timer resolution record audit history and reject invalid state or undeclared resolution paths
- [x] 4.4 Integration test duplicate finalize requests with one idempotency key record exactly one commit, replay its result, and reject conflicting reuse
- [x] 4.5 Integration test event submission invalid for current match state is rejected server-side even if a client offered it
- [x] 4.6 Integration test each console mutation writes a versioned outbox projection suitable for SSE reconciliation

## 5. E2E tests

- [x] 5.1 Playwright: record a full fixture event sequence and verify scoreboard, timers, and Event Ledger reconcile from the authoritative projection
- [x] 5.2 Playwright: trigger the conditional penalty-to-goal-or-missed branch and verify the correct final form opens
- [x] 5.3 Playwright: adjust the clock and resolve a timer with authorized controls, then verify audit-backed state renders after refresh
- [x] 5.4 Playwright: double-submit finalization and verify only one commit occurs, including a retried response after simulated network loss
- [x] 5.5 Playwright: simulate an authoritative projection differing from optimistic state and verify reconciliation, stale indication, and refetch
- [x] 5.6 Playwright: verify a referee without finalize capability cannot access or trigger finalization, while a granted referee can record events
- [x] 5.7 Playwright: verify unavailable telemetry is labelled unavailable and no tile presents fabricated figures

## 6. CI wiring

- [x] 6.1 Add unit tests to `.github/workflows/ci.yml` `unit-tests`, integration tests to `integration-tests`, and Playwright tests to `e2e-tests`; mark idempotency, authorization, and reconciliation scenarios as required non-flaky checks
