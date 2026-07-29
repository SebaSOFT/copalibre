## 1. Resource model

- [ ] 1.1 Add Venue and Official referenceable entities to `packages/domain`
- [ ] 1.2 Add persistence repositories for Venue/Official assignment state (phase 4 extension)

## 2. Conflict detection

- [ ] 2.1 Implement venue double-booking detection
- [ ] 2.2 Implement official double-booking detection
- [ ] 2.3 Implement configurable rest-rule violation detection
- [ ] 2.4 Wire all three checks synchronously into the assignment-write transaction

## 3. Downstream-impact preview

- [ ] 3.1 Implement the read-only dry-run endpoint reusing the commit validation path
- [ ] 3.2 Implement affected-item resolution (published fixtures, notifications, public views referencing the changed slot)

## 4. Atomic publication

- [ ] 4.1 Implement batch schedule-publish with one transaction per batch
- [ ] 4.2 Implement all-or-nothing rejection on any single assignment failure within a batch
- [ ] 4.3 Implement concurrency handling so overlapping concurrent publishes never interleave

## 5. Mutation classification

- [ ] 5.1 Classify unpublished draft schedule edits as `safe`
- [ ] 5.2 Classify edits requiring downstream re-preview as `requires_rebuild`
- [ ] 5.3 Classify edits to already-completed matches as `blocked_after_results`

## 6. Unit tests

- [ ] 6.1 Unit tests for each conflict-detection rule (venue, official, rest-rule) in isolation
- [ ] 6.2 Unit tests for mutation classification decisions

## 7. Integration tests

- [ ] 7.1 Integration test: batch publish with one invalid assignment publishes nothing
- [ ] 7.2 Integration test: concurrent publish attempts on overlapping resources — exactly one succeeds
- [ ] 7.3 Integration test: downstream-impact preview matches actual commit-time affected-item resolution
- [ ] 7.4 Integration test: rescheduling a completed match is blocked and directs to the correction workflow

## 8. CI wiring

- [ ] 8.1 Extend the `tournament-engine-tests` job (added in phase 6) in `.github/workflows/ci.yml` to include this phase's scheduling unit and integration suites
