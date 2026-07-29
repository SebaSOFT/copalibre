## 1. Identifier value objects

- [ ] 1.1 Implement `UUIDv7` value object (generate, parse, validate, compare) per RFC 9562
- [ ] 1.2 Implement `Alias` value object (kebab-case validation, scope type: organization | tournament | circuit | participant)
- [ ] 1.3 Reject construction of either value object from invalid input with a typed error, not a thrown string

## 2. Configuration hierarchy types

- [ ] 2.1 Define `DisciplineDescriptor` (participant types, roster constraints, segment types, event definitions, statistics, scoring inputs, available formats, notification-rule capabilities, UI metadata, defaults) with a version field
- [ ] 2.2 Define `TournamentRuleset` referencing a versioned `DisciplineDescriptor` plus its permitted overrides
- [ ] 2.3 Define `StageConfiguration` refining a `TournamentRuleset` for one phase
- [ ] 2.4 Define `MatchRuleset` as the resolved, immutable snapshot recording descriptor/ruleset versions compiled from
- [ ] 2.5 Define the per-field override-permission metadata type: `inherited | replaced | merged(<strategy>) | forbidden`
- [ ] 2.6 Define the mutation-class metadata type: `safe | requires_rebuild | blocked_after_results`

## 3. Effective-ruleset compiler

- [ ] 3.1 Implement the compiler function: `DisciplineDescriptor + override chain -> validated MatchRuleset`
- [ ] 3.2 Reject overrides targeting `forbidden` fields
- [ ] 3.3 Reject overrides with no declared merge strategy (no implicit deep merge)
- [ ] 3.4 Apply declared merge strategies correctly for `merged` fields
- [ ] 3.5 Record source descriptor/ruleset versions on the compiled `MatchRuleset`

## 4. Core aggregates

- [ ] 4.1 Define `Organization` / `Club`
- [ ] 4.2 Define `Tournament`
- [ ] 4.3 Define `Participant`, `Team`, `Roster`, `Entrant`
- [ ] 4.4 Define `Stage`, `Fixture`, `Match`
- [ ] 4.5 Define `Segment` (discipline-declared named unit, not a closed enum)
- [ ] 4.6 Define the append-only `Event` log entity (event definition ref, segment ref, occurrence order/time, affected side/participant, validated payload)
- [ ] 4.7 Define event category (`positive | negative | neutral`) as presentation/accounting metadata only, never implying a score/statistic/penalty/state effect by itself

## 5. Mutation enforcement

- [ ] 5.1 Implement the mutation-class check: reject `blocked_after_results` field changes once a match under that scope has a recorded result
- [ ] 5.2 Implement `requires_rebuild` signaling: return which generated fixtures/results become invalid, without performing the rebuild itself (rebuild is phase 6's concern)
- [ ] 5.3 Implement `safe` field changes applying without side effects

## 6. Unit tests

- [ ] 6.1 Test UUIDv7 generation ordering, parsing, and rejection of v4/ULID-shaped input
- [ ] 6.2 Test `Alias` validation (valid/invalid kebab-case cases, scope-uniqueness contract)
- [ ] 6.3 Test effective-ruleset compilation for every override-permission combination (inherited, replaced, merged, forbidden) including rejection cases
- [ ] 6.4 Test mutation-class enforcement for all three classes, including the blocked-after-results rejection path
- [ ] 6.5 Test event recording rejects a payload that fails its event definition's schema
- [ ] 6.6 Test event category never implies a score/statistic effect unless explicitly configured on the event definition
- [ ] 6.7 Achieve and enforce a coverage threshold for `packages/domain` consistent with the repo's later-established coverage gate (flag as a follow-up if no threshold exists yet at this phase)

## 7. CI wiring

- [ ] 7.1 Add a `unit-tests` job to `.github/workflows/ci.yml` (extending the `install`/`lint`/`typecheck`/`license-scan` jobs from `0001-bootstrap-monorepo-toolchain`) running `yarn workspace @copalibre/domain test`
- [ ] 7.2 Scope the new job to run on every pull request alongside the existing jobs, uploading a coverage artifact for `packages/domain`
