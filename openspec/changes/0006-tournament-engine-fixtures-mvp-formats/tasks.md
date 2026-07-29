## 1. Format guard

- [ ] 1.1 Implement format-allowlist validation at tournament-ruleset configuration time
- [ ] 1.2 Reject any format outside the six MVP formats with an explicit error, before fixture generation runs

## 2. Single-elimination fixture generation

- [ ] 2.1 Implement seed-to-slot placement (standard bracket seeding order)
- [ ] 2.2 Implement bye handling for non-power-of-two entrant counts
- [ ] 2.3 Implement round-by-round fixture graph construction

## 3. Double-elimination fixture generation (resolves the open bracket-layout gap)

- [ ] 3.1 Reuse phase 2's single-elimination generator for the winners bracket
- [ ] 3.2 Implement the losers-bracket round structure and the drop-round routing formula for winners-bracket losers
- [ ] 3.3 Implement bye handling in the losers bracket for non-power-of-two entrant counts
- [ ] 3.4 Implement the grand-final node, including the conditional bracket-reset match
- [ ] 3.5 Add golden-fixture tests for 4/8/16-entrant brackets (see section 8) as the acceptance bar for this task group

## 4. Round robin, league, and round-robin variants

- [ ] 4.1 Implement round robin (all-play-all) fixture generation
- [ ] 4.2 Implement league fixture generation (configurable points/scheduling shape reused from round robin)
- [ ] 4.3 Implement round-robin single-leg fixture generation
- [ ] 4.4 Implement round-robin home-and-away fixture generation (double round robin with venue/side assignment)

## 5. Standings and tiebreak integration

- [ ] 5.1 Implement per-format accounting-parameter assembly (points, goal difference, head-to-head, etc.) as input to phase 3's comparator pipeline
- [ ] 5.2 Wire standings output to always include phase 3's explanation trace
- [ ] 5.3 Implement standings recalculation on new result recorded

## 6. Advancement engine

- [ ] 6.1 Implement elimination-format advancement (winner/loser slot population, including double-elimination losers-bracket routing)
- [ ] 6.2 Implement round-robin/league advancement (standings recompute only, no fixture regeneration)
- [ ] 6.3 Implement advancement recomputation-from-structure (not imperative pointer mutation), per design.md

## 7. Mutation classification enforcement

- [ ] 7.1 Classify format changes as `blocked_after_results` once any result exists
- [ ] 7.2 Classify seed changes before any match starts as `safe`
- [ ] 7.3 Classify structural changes after fixtures exist but before results as `requires_rebuild`, with explicit reporting of which generated fixtures become invalid

## 8. Unit tests

- [ ] 8.1 Golden-fixture tests: single elimination for 4/8/16/5/6/11 entrants (power-of-two and non-power-of-two)
- [ ] 8.2 Golden-fixture tests: double elimination for 4/8/16/5/6/11 entrants, including bracket-reset scenario
- [ ] 8.3 Golden-fixture tests: round robin, league, round-robin single-leg, round-robin home-and-away for representative entrant counts
- [ ] 8.4 Repeated-generation-is-identical test for every format
- [ ] 8.5 Standings-trace unit tests asserting the trace matches phase 3's comparator pipeline output exactly

## 9. Integration tests

- [ ] 9.1 Integration test: unsupported format rejected at configuration time, persisted nowhere
- [ ] 9.2 Integration test: format change after a result exists is blocked and directs to the correction workflow
- [ ] 9.3 Integration test: recording a result triggers correct advancement end-to-end through phase 4's repositories

## 10. CI wiring

- [ ] 10.1 Add a `tournament-engine-tests` job (needs `install`, and the `integration-tests` Postgres service from phase 4) to `.github/workflows/ci.yml` running this phase's unit and integration suites, including the golden-fixture regression set
