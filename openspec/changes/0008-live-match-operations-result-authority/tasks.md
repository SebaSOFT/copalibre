## 1. Event-definition registry

- [ ] 1.1 Implement the discipline event-definition registry (schema, permitted segments, actor/side requirements, validation rules, declarative effects)
- [ ] 1.2 Implement positive/negative/neutral event categorization (presentation-only, no implicit score/state effect)
- [ ] 1.3 Implement generic segment types (game/set/map/half/quarter/period/lap/round/timed-interval)

## 2. Match-scoped authorization

- [ ] 2.1 Implement the four separate capability grants: event entry, clock control, lineup selection, finalization
- [ ] 2.2 Scope every grant to one match; reject cross-match capability leakage
- [ ] 2.3 Wire capability checks into phase 5's guard/policy layer

## 3. Match-control endpoints

- [ ] 3.1 Implement start/pause/resume/finalize endpoints
- [ ] 3.2 Implement event-recording endpoint validating against the discipline registry
- [ ] 3.3 Implement timer management, including timed-penalty start/duration/resolution as auditable state
- [ ] 3.4 Implement lineup-selection endpoint with eligibility check against the active roster

## 4. Event-triggered notifications

- [ ] 4.1 Implement threshold/cooldown rule evaluation reusing phase 3's rule registry
- [ ] 4.2 Implement idempotency keying on `(rule_id, threshold_crossing_id)`
- [ ] 4.3 Wire notification evaluation into the same transaction as event recording

## 5. Finalization and advancement

- [ ] 5.1 Wire match finalization to phase 6's advancement engine
- [ ] 5.2 Implement audit + outbox write for finalization, consistent with phase 4's transaction pattern

## 6. Correction/supersession workflow

- [ ] 6.1 Implement the correction request/response shape (prior state, replacement state, mandatory reason, actor, timestamp)
- [ ] 6.2 Implement correction downstream-impact preview (standings + future fixtures), reusing phase 7's preview pattern
- [ ] 6.3 Implement correction commit: preserve prior fact and trace, write replacement state, recalculate
- [ ] 6.4 Implement blocked-propagation detection and surfaced conflict state for already-started downstream stages
- [ ] 6.5 Implement correction audit-history retrieval (full chain of prior states, in order)
- [ ] 6.6 Explicitly ensure no endpoint exists that writes a finalized outcome outside this correction path

## 7. Unit tests

- [ ] 7.1 Unit tests for event-definition schema validation (valid/invalid payloads, wrong segment, wrong discipline)
- [ ] 7.2 Unit tests for capability-scoped authorization (each of the four capabilities, cross-match isolation)
- [ ] 7.3 Unit tests for notification idempotency keying

## 8. Integration tests

- [ ] 8.1 Integration test: full command → domain transaction → audit + outbox flow for event recording
- [ ] 8.2 Integration test: finalization triggers correct advancement for each of the six MVP formats
- [ ] 8.3 Integration test: correction preview matches actual post-commit effect
- [ ] 8.4 Integration test: correction affecting a started downstream stage is blocked from auto-propagating and surfaces as a resolvable conflict
- [ ] 8.5 Integration test: direct-overwrite attempt on a finalized outcome is rejected on every write path
- [ ] 8.6 Integration test: reconnect/refresh does not duplicate a threshold-crossing notification

## 9. CI wiring

- [ ] 9.1 Add a `live-match-operations-tests` job (needs `install`, Postgres service) to `.github/workflows/ci.yml` running this phase's unit and integration suites
