## 1. Domain model

- [ ] 1.1 Add advancement-rule fields (advance count, ranking criteria reference, target seed mapping) to `StageConfiguration` in `packages/domain`
- [ ] 1.2 Add validation rejecting an advance-count/next-stage-seed-slot mismatch at configuration time
- [ ] 1.3 Add an explicit stage-completion state distinct from "all matches resolved"

## 2. Advancement engine

- [ ] 2.1 Implement advancement resolution (top-N by configured standings ranking → next-stage seed positions)
- [ ] 2.2 Implement advancement preview (read-only, no fixture/seed commitment)
- [ ] 2.3 Gate next-stage fixture generation on prior-stage completion

## 3. Cross-stage correction policy

- [ ] 3.1 Extend phase 8's correction workflow to detect when a correction to a completed stage would change advancement outcomes
- [ ] 3.2 Classify such a correction as blocked once the next stage has started, scoped to the specific affected next-stage segment
- [ ] 3.3 Implement the authorized-resolution flow to unblock and propagate a cross-stage correction

## 4. Unit tests

- [ ] 4.1 Unit test advancement resolution against golden fixtures (known standings → known advancement output)
- [ ] 4.2 Unit test advance-count/seed-slot mismatch validation
- [ ] 4.3 Unit test the blocked-vs-allowed correction classification boundary

## 5. Integration tests

- [ ] 5.1 Integration test: next-stage fixture generation is rejected while prior stage is incomplete
- [ ] 5.2 Integration test: advancement preview mid-stage produces no persisted next-stage fixtures or seeds
- [ ] 5.3 Integration test: a correction to a completed stage after the next stage has started is blocked and requires authorized resolution before propagating

## 6. CI wiring

- [ ] 6.1 Add the 0023-multi-stage-progression unit and integration tests to the existing `unit`/`integration` jobs in `.github/workflows/ci.yml`
