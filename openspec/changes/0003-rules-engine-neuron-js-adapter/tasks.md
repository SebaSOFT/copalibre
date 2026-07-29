## 1. Dependency and package setup

- [ ] 1.1 Add `@sebasoft/neuron-js` as a pinned dependency of `packages/rules`
- [ ] 1.2 Replace the phase-1 placeholder `packages/rules/src/index.ts` with the real public surface
- [ ] 1.3 Confirm `packages/rules` has no `@nestjs/*`/`fastify` import (same boundary check as phase 2)

## 2. Typed registry

- [ ] 2.1 Define the registry data structure for permitted actions, conditions, and parameters, keyed by stable identifier
- [ ] 2.2 Implement registry lookup used during `DisciplineDescriptor` validation (phase 2's compiler calls into this)
- [ ] 2.3 Reject any descriptor reference to an unregistered identifier

## 3. Tiebreak comparator pipeline

- [ ] 3.1 Define the comparator type: identifier, display label, value type, aggregation scope/calculation rule, comparison direction, missing/invalid/equality behavior
- [ ] 3.2 Implement sequential pipeline evaluation stopping at first resolution
- [ ] 3.3 Implement the explicit unresolved-tie result for a fully-exhausted pipeline
- [ ] 3.4 Implement `higher_wins`, `lower_wins`, and explicit ordered-value comparison directions

## 4. Eligibility and advancement guards

- [ ] 4.1 Implement eligibility-guard evaluation against participant/roster/lineup facts
- [ ] 4.2 Implement advancement/state-transition guard evaluation against `MatchRuleset` + `Event` log inputs
- [ ] 4.3 Ensure guard results carry an explanation trace naming the failed/passed condition

## 5. Event-triggered notification rules

- [ ] 5.1 Define the notification-rule type: scope, input predicate, aggregation, threshold/comparator, trigger semantics
- [ ] 5.2 Implement threshold-crossing, every-qualifying-event, and bounded repeat/cooldown trigger semantics
- [ ] 5.3 Implement idempotent delivery keyed by a stable (rule, scope, threshold-crossing) identity so reconnect/refresh/recalculation never re-fires the same crossing

## 6. Explanation trace

- [ ] 6.1 Define the explanation-trace type: ruleset version, input facts, output, human-inspectable trace nodes
- [ ] 6.2 Ensure trace output is deterministic for identical inputs
- [ ] 6.3 Ensure trace type is JSON-serializable and round-trips without loss

## 7. Unit tests

- [ ] 7.1 Test registry rejection of unregistered action/condition/parameter identifiers
- [ ] 7.2 Test comparator pipeline resolution at first discriminating comparator, with golden fixtures covering `higher_wins`, `lower_wins`, and ordered-value directions
- [ ] 7.3 Test full-exhaustion unresolved-tie behavior
- [ ] 7.4 Test eligibility guard blocking and passing cases with trace assertions
- [ ] 7.5 Test advancement guard blocking on missing prerequisite results
- [ ] 7.6 Test notification idempotency: threshold crossing fires once even across simulated reconnect/recalculation
- [ ] 7.7 Test notification sub-threshold non-firing
- [ ] 7.8 Test explanation-trace determinism and JSON round-trip

## 8. Deterministic golden-fixture tests

- [ ] 8.1 Build a golden-fixture harness (input facts + ruleset version -> expected trace + output) reusable by phase 6's format-specific tests
- [ ] 8.2 Add at least one golden fixture per comparator direction and per guard type

## 9. CI wiring

- [ ] 9.1 Extend the `unit-tests` job added in `0002-domain-model-core`'s `tasks.md` to also run `yarn workspace @copalibre/rules test`
- [ ] 9.2 Ensure the golden-fixture suite runs as part of the same job and fails the pull request on any fixture mismatch
