# rules-engine Specification

## Purpose
Provides CopaLibre's deterministic, explainable decision runtime — tiebreaks, eligibility,
advancement, and notification rules evaluated as versioned, auditable Neuron-JS decisions instead of
hardcoded conditionals — so every ranking and gate can show its own reasoning.
## Requirements
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

### Requirement: Tiebreak parameters resolve through a capability binding
A tiebreak parameter referencing a capability name SHALL be evaluated against the discipline code
that the compiled binding resolved it to.

#### Scenario: The same profile ranks two different disciplines
- **WHEN** one profile's pipeline is evaluated against two disciplines whose primary scoring codes differ
- **THEN** each evaluation reads that discipline's own code, and each explanation trace names the
  resolved code

#### Scenario: An overridden unsatisfied requirement is visible in the trace
- **WHEN** a required capability was unsatisfied and explicitly overridden by an operator
- **THEN** the explanation trace records that the comparator was skipped and why

### Requirement: The win-condition action registry is owned by the core
The rules engine SHALL provide the win-condition actions (`winSegment`, `winMatch`, `requireMargin`)
as a vetted registry, and a submitted module SHALL NOT be able to introduce a new action.

#### Scenario: A module composes existing actions
- **WHEN** a discipline module's win-condition script composes `winSegment`, `requireMargin` and
  `winMatch`
- **THEN** the script validates and compiles without a core release

#### Scenario: Vocabulary extension requires a core release
- **WHEN** a module declares an action name absent from the registry
- **THEN** validation rejects the module and states that new actions require a core release

### Requirement: Win-condition evaluation is explainable
Evaluating a win condition SHALL produce an explanation trace consistent with the existing
tiebreak-trace contract, naming which action closed the segment or match and on what values.

#### Scenario: A closed match explains itself
- **WHEN** a match closes under a margin-gated win condition
- **THEN** the trace names the satisfied threshold, the margin applied, and the values compared

### Requirement: The constraint action registry is owned by the core
The rules engine SHALL provide constraint actions as a vetted registry that a submitted module cannot
extend, consistent with the win-condition registry boundary.

#### Scenario: A constraint script composes registry actions
- **WHEN** a constraint script composes only registry actions
- **THEN** it validates and evaluates without a core release

### Requirement: Comparators may express a ratio of two statistics
A comparator SHALL be declarable over a numerator and a denominator statistic, with explicit declared
behaviour when the denominator is zero.

#### Scenario: A ratio comparator ranks entrants
- **WHEN** a comparator declares `frags` over `deaths` and entrants have differing totals of both
- **THEN** entrants are ordered by the ratio and the trace names both statistics and the computed
  value

#### Scenario: Zero denominator follows the declared rule
- **WHEN** an entrant's denominator statistic is zero
- **THEN** the declared zero-denominator behaviour applies and the trace records that it applied,
  rather than producing an infinite or undefined value

### Requirement: Constraint evaluation is explainable
Evaluating a constraint SHALL produce a trace consistent with the existing tiebreak-trace contract,
naming the constraint and the entrants and attribute values involved.

#### Scenario: A rejected placement explains itself
- **WHEN** the draw rejects a candidate placement because of a constraint
- **THEN** the trace names the constraint, the attribute value, and the entrants that conflicted

### Requirement: Conditions cover more than arithmetic
The registry SHALL provide conditions for string comparison, set membership, value existence and
time comparison, so a rule can test context values that are not numbers.

#### Scenario: A rule tests a categorical value
- **WHEN** a rule asks whether an entrant's status equals a named value
- **THEN** the condition evaluates without expressing the comparison as a number

#### Scenario: A rule tests membership of a declared set
- **WHEN** a rule asks whether a recorded event's code is one of several disqualifying codes
- **THEN** the condition evaluates true for any member of the set and false otherwise

#### Scenario: A rule distinguishes absent from zero
- **WHEN** a rule asks whether a fact was recorded at all
- **THEN** an absent value and a value of zero produce different answers

#### Scenario: A rule compares instants
- **WHEN** a rule asks whether one recorded instant falls before another
- **THEN** the comparison is evaluated on the instants, not on their string forms

### Requirement: Any parameter is either a fixed value or an expression
Every parameter SHALL accept either a fixed value or an expression over the context, and
switching between the two SHALL NOT change the parameter's registered type.

#### Scenario: A rule compares a computed value without the core publishing it
- **WHEN** a rule needs the difference between two sides' scores
- **THEN** a numeric parameter in expression mode produces it, and an ordinary numeric condition
  compares it, without a core release to publish that difference in the context

#### Scenario: A whole-field expression keeps its type, a mixed one becomes a string
- **WHEN** a parameter holds one expression and nothing else
- **THEN** it resolves to the typed value, usable directly as a numeric operand
- **AND WHEN** a parameter mixes literal text with expressions
- **THEN** it resolves to a string, usable directly as a message

#### Scenario: Switching a field to an expression leaves the vetted vocabulary untouched
- **WHEN** an author changes a parameter from a fixed value to an expression
- **THEN** the parameter's type identifier is unchanged, and the registry vets it exactly as before

#### Scenario: A field must say plainly which mode it is in
- **WHEN** a parameter holds `{{ }}` without declaring expression mode, or declares expression mode
  over a value that is not text
- **THEN** it is refused at validation naming what to fix, rather than rendering its own source into a
  message an operator reads

#### Scenario: An expression reaching beyond reading, arithmetic and registered functions is refused
- **WHEN** a submitted expression contains a comparison, a conditional, an assignment, or a call to a
  function the registry does not provide
- **THEN** validation rejects it naming what is not permitted, rather than evaluating it

#### Scenario: A registered function computes what no fact publishes
- **WHEN** an expression calls a registered function over the context
- **THEN** it resolves, and a module cannot introduce a function of its own to call

#### Scenario: An expression cannot read the wall clock
- **WHEN** a rule needs to reason about time
- **THEN** it reads the sampled instant from the context, and no function returns the current time —
  so a replayed evaluation produces the identical result

#### Scenario: Elapsed time needs no zone
- **WHEN** a rule asks how long ago something happened
- **THEN** the answer follows from arithmetic over epochs, with no zone involved

#### Scenario: A local calendar question states its zone
- **WHEN** a rule asks which day or hour an instant falls on
- **THEN** the zone is passed explicitly as context data, so the same instant yields the same answer
  regardless of where the evaluation runs

#### Scenario: Rendering an instant for a person is not the engine's job
- **WHEN** a message needs a human-readable date
- **THEN** the engine supplies the instant and the surface renders it, because a formatted date
  varies by viewer while a rule's output must not

#### Scenario: An undefined mathematical result yields no value rather than an infinity
- **WHEN** an expression takes a logarithm of zero, or an average of nothing
- **THEN** it produces no value, and the consuming condition applies its declared missing-value
  behaviour instead of ranking an infinity first

#### Scenario: An expression over an absent fact degrades rather than throwing
- **WHEN** an expression reads a context path the hook did not publish
- **THEN** it produces no value, and the condition consuming it applies its declared missing-value
  behaviour

#### Scenario: A message states the values that produced it
- **WHEN** a notification declares its message as a template over the context
- **THEN** the delivered message carries those values, and the trace records the template alongside
  the result

### Requirement: Effectful actions are idempotent by construction
The registry SHALL provide actions declaring a notification and starting or stopping a timer, and
each SHALL record a declared effect with a stable identity rather than performing the effect.

#### Scenario: A notification action yields the same instance shape as a notification rule
- **WHEN** a script declares a notification and a threshold rule fires one
- **THEN** both produce a notification instance carrying an identity key, and delivery treats them
  identically

#### Scenario: A declared effect names what caused it
- **WHEN** a declared notification or timer is inspected
- **THEN** it names the hook, the script and the rule that produced it, so the effect is traceable
  to a decision rather than appearing from nowhere

#### Scenario: A timer's remaining time is derived, never stored as a countdown
- **WHEN** a declared timer is read at two different instants
- **THEN** the remaining time follows from its start instant and duration at each read

### Requirement: Degenerate scripts behave as specified
Evaluation SHALL define the outcome of a script with no rules, a rule with no conditions and a rule
with no actions, and SHALL apply the guard exception consistently.

#### Scenario: Absence of rules is not absence of an answer
- **WHEN** any evaluation receives a script with no rules
- **THEN** it produces its declared default — permissive everywhere except a guard, which denies

#### Scenario: An unconditional rule is a valid way to express "always"
- **WHEN** a rule declares an empty condition list
- **THEN** its actions run, and the trace records that it fired unconditionally

