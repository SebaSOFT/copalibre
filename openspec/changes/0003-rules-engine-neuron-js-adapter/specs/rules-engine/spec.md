## Purpose

Provides CopaLibre's deterministic, explainable decision runtime — tiebreaks, eligibility,
advancement, and notification rules evaluated as versioned, auditable Neuron-JS decisions instead of
hardcoded conditionals — so every ranking and gate can show its own reasoning.

## ADDED Requirements

### Requirement: Framework-free rules package
`packages/rules` SHALL contain no import of `@nestjs/*` or `fastify`, consistent with the boundary
rule applied to `packages/domain`.

#### Scenario: Rules package has no framework dependency
- **WHEN** the dependency graph of `packages/rules` is inspected
- **THEN** it contains no `@nestjs/*` or `fastify` package

### Requirement: Registry-scoped rule vocabulary
A `DisciplineDescriptor` SHALL reference rule actions, conditions, and parameters only by stable
identifier from an application-owned typed registry; it SHALL NOT be able to supply arbitrary
executable code.

#### Scenario: Unknown action identifier is rejected
- **WHEN** a descriptor references an action identifier not present in the registry
- **THEN** the adapter rejects the descriptor at validation time, before any rule executes

#### Scenario: Registry action executes deterministically
- **WHEN** a registered action is invoked twice with identical input facts and the same ruleset version
- **THEN** it produces an identical output and an identical explanation trace both times

### Requirement: Ordered tiebreak comparator pipeline
The engine SHALL resolve ties by evaluating a tournament- or stage-selected ordered sequence of
comparators, each with a stable identifier, value type, aggregation rule, comparison direction
(`higher_wins`, `lower_wins`, or an explicit ordered-value comparator), and defined missing/invalid/
equality behavior, stopping at the first comparator that resolves the tie.

#### Scenario: Tie resolves at the first discriminating comparator
- **WHEN** two participants are tied on all comparators before position 3, and comparator 3 distinguishes them
- **THEN** the pipeline resolves the tie at comparator 3 and does not evaluate comparator 4 or later for ranking purposes

#### Scenario: Full tie retains an unresolved state, not a silent default
- **WHEN** all configured comparators are exhausted without resolving a tie
- **THEN** the pipeline reports an explicit unresolved-tie result rather than defaulting to an arbitrary order

### Requirement: Eligibility and advancement guards
The engine SHALL evaluate eligibility (participant/roster/lineup facts) and advancement
(state-transition) guards as deterministic Neuron-JS decisions consuming a compiled `MatchRuleset`
and the `Event` log as inputs.

#### Scenario: Ineligible participant is blocked
- **WHEN** an eligibility guard evaluates a participant who fails a configured eligibility condition
- **THEN** the guard returns a blocking result with an explanation trace naming the failed condition

#### Scenario: Advancement guard blocks progression on an unresolved prerequisite
- **WHEN** an advancement guard evaluates a stage whose prerequisite matches have no recorded result
- **THEN** the guard returns a blocking result rather than allowing progression

### Requirement: Idempotent event-triggered notifications
A notification rule SHALL declare scope, input predicate, aggregation, threshold/comparator, and
trigger semantics (threshold-crossing, every qualifying event, or bounded repeat/cooldown), and its
delivery SHALL be idempotent under reconnect, refresh, or recalculation.

#### Scenario: Threshold crossing fires exactly once
- **WHEN** a configured threshold is crossed by a recorded event
- **AND** the client reconnects or the projection is recalculated afterward
- **THEN** the notification for that specific threshold crossing is not delivered a second time

#### Scenario: Sub-threshold event does not fire
- **WHEN** an event is recorded that keeps the aggregated value below the configured threshold
- **THEN** no notification is emitted

### Requirement: Versioned, serializable explanation trace
Every decision evaluation SHALL retain its ruleset version, input facts, output, and a serializable
explanation trace suitable for direct UI rendering.

#### Scenario: Trace is stable for identical inputs
- **WHEN** the same decision is evaluated twice against the same ruleset version and input facts
- **THEN** the two explanation traces are structurally identical

#### Scenario: Trace survives serialization round-trip
- **WHEN** an explanation trace is serialized to JSON and deserialized
- **THEN** the deserialized trace is equal to the original trace
