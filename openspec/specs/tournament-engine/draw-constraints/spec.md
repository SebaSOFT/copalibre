# draw-constraints Specification

## Purpose
Lets an operator impose domain knowledge the results cannot supply — keep these apart, spread those
around — on how entrants are drawn into groups and paired into rounds, declaratively for the common
shapes and by script for the rest, with a draw that stays reproducible and explains its failures.

## Requirements
### Requirement: Separation constraints keep matching entrants apart
A constraint SHALL be declarable that entrants sharing an attribute value must not share a group, or
must not meet before a named round.

#### Scenario: Same-region entrants are kept out of one group
- **WHEN** a separation constraint on `region` is declared with group scope and several entrants
  share a region
- **THEN** no group in the resulting draw contains two of them

#### Scenario: Separation is scoped to a named round, not merely the first
- **WHEN** a separation constraint declares that entrants sharing `region=san-juan` must not meet
  before the round of 16
- **THEN** the draw places them so that no two of them can meet in or before the round of 16, while
  permitting them to meet later

### Requirement: Distribution constraints spread matching entrants across groups
A constraint SHALL be declarable that each group contains at least or at most N entrants carrying a
given attribute value.

#### Scenario: Every group receives one entrant of a given region
- **WHEN** a distribution constraint requires at least one `region=buenos-aires` entrant per group
  and there are at least as many such entrants as groups
- **THEN** every group in the resulting draw contains at least one of them

#### Scenario: A maximum is enforced
- **WHEN** a distribution constraint caps a group at two entrants of one association
- **THEN** no group in the resulting draw exceeds that cap

### Requirement: Constraints may be scripted when the declarative kinds do not suffice
A constraint SHALL be expressible as a rule script over the core-provided constraint action registry,
and a module SHALL NOT be able to introduce a new action.

#### Scenario: An unanticipated constraint is expressed without a core release
- **WHEN** an operator declares a constraint no declarative kind covers, as a script composing
  registry actions
- **THEN** the draw honours it and the script is evaluated on the standard explanation-trace contract

#### Scenario: A script naming an unregistered action is rejected
- **WHEN** a constraint script references an action absent from the registry
- **THEN** validation rejects it naming the unknown action

### Requirement: Constraints attach to named hook points across tournament and discipline events
Constraints SHALL be registered against named hook points rather than being specific to seeding, so
later phases attach to the same surface.

#### Scenario: The same constraint mechanism serves a different hook
- **WHEN** a constraint is registered against a hook point other than the draw
- **THEN** it is evaluated at that hook with the same declaration format and trace contract

#### Scenario: A constraint on an unknown hook point is rejected
- **WHEN** a constraint declares a hook point the taxonomy does not define
- **THEN** configuration validation rejects it

### Requirement: A constrained draw is reproducible from a recorded seed
A draw's random component SHALL run from a seed recorded with the draw, and replaying the draw with
the same seed, entrants and constraints SHALL produce an identical result.

#### Scenario: A draw replays identically
- **WHEN** a completed draw is replayed with its recorded seed and unchanged inputs
- **THEN** every entrant lands in the same group and seed position as originally drawn

#### Scenario: A different seed produces a different valid draw
- **WHEN** the same entrants and constraints are drawn under a different seed
- **THEN** the result differs but still satisfies every declared constraint

### Requirement: An unsatisfiable constraint set fails with an explanation
When no assignment satisfies the declared constraints, the draw SHALL fail identifying the conflict
rather than retrying indefinitely or relaxing a constraint silently.

#### Scenario: Too many entrants share a separated attribute
- **WHEN** more entrants share a separated attribute value than the structure can keep apart
- **THEN** the draw fails and the message names the attribute, the count, and the structural limit
  that cannot accommodate it

#### Scenario: No constraint is silently relaxed
- **WHEN** a draw cannot satisfy every constraint
- **THEN** no partially-constrained draw is committed
