## 1. Match header and clock

- [ ] 1.1 Build circular SVG match-clock progress ring driven by server-reported elapsed time
- [ ] 1.2 Build live scoreboard header with LIVE status badge
- [ ] 1.3 Implement authorized manual clock adjustment (set time/period) flow

## 2. Discipline-aware event palette

- [ ] 2.1 Render event palette from the active `DisciplineDescriptor`'s event-definition registry (labels/icons/colors/fields as presentation metadata)
- [ ] 2.2 Filter palette to event types valid for current match state, actor, and segment
- [ ] 2.3 Implement conditional event workflow (branch to quick outcome choice, e.g. penalty → goal/missed, before final form)
- [ ] 2.4 Implement event form: side, eligible player (from active lineup), coaching staff where permitted, optional free-text description

## 3. Timers

- [ ] 3.1 Render active timers as visible objects (type, affected side/participant, remaining time)
- [ ] 3.2 Implement authorized dismissal/resolution action, rejecting unauthorized attempts

## 4. Event history and tactical tiles

- [ ] 4.1 Build chronological, period-aware Event Ledger with category filters
- [ ] 4.2 Build tactical data tiles (stream latency, packet loss, spectator count, stream uptime)
- [ ] 4.3 Build plain-text log-note footer field (no command-execution semantics)

## 5. Finalize workflow

- [ ] 5.1 Build destructive finalize confirmation dialog (`.cl-inline-alert`) naming the immutable-ledger consequence
- [ ] 5.2 Generate a client-side idempotency key per finalize attempt
- [ ] 5.3 Disable/guard the finalize control after submission pending server response

## 6. Optimistic update reconciliation

- [ ] 6.1 Apply optimistic score/statistic updates on event submission
- [ ] 6.2 Reconcile optimistic state against the next authoritative SSE event for the match
- [ ] 6.3 Implement a bounded reconciliation timeout with a visible stale-data indicator on expiry

## 7. Authorization

- [ ] 7.1 Gate event entry, clock control, lineup selection, and finalize as independently checked, match-scoped capabilities
- [ ] 7.2 Hide/disable controls the current user lacks capability for, and reject server-side regardless of UI state

## 8. Unit tests

- [ ] 8.1 Unit test event-palette filtering logic against fixture discipline descriptors
- [ ] 8.2 Unit test the conditional event workflow branching logic
- [ ] 8.3 Unit test idempotency-key generation uniqueness per attempt

## 9. Integration tests

- [ ] 9.1 Integration test: duplicate finalize submission with the same idempotency key results in exactly one commit
- [ ] 9.2 Integration test: event submission invalid for current match state is rejected server-side even if the client palette incorrectly offered it
- [ ] 9.3 Integration test: unauthorized timer dismissal / finalize / clock-control attempts are rejected with the correct authorization error

## 10. E2E tests

- [ ] 10.1 Playwright: record a full event sequence for a fixture discipline and verify event history renders correctly
- [ ] 10.2 Playwright: trigger the conditional penalty → goal/missed branch and verify the correct final form opens
- [ ] 10.3 Playwright: attempt to finalize twice in rapid succession (double-click) and verify only one commit occurs and the UI reflects a single finalized state
- [ ] 10.4 Playwright: simulate a server-side authoritative recalculation differing from the optimistic value and verify the UI reconciles to the authoritative value
- [ ] 10.5 Playwright: verify a user lacking finalize capability cannot access or trigger the finalize dialog

## 11. CI wiring

- [ ] 11.1 Add this capability's Jest specs to the existing `unit-tests` job's test glob, its integration specs to the `integration-tests` job, and its Playwright specs to the `e2e-tests` job in `.github/workflows/ci.yml`; mark the double-submit and reconciliation e2e tests as required (non-flaky-tolerant) checks given the correctness stakes
