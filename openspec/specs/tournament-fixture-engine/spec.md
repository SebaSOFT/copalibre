# tournament-fixture-engine Specification

## Purpose
Deterministically turns a tournament's entrant list and format selection into a fixture graph,
computes standings with a full explanation trace, and advances the competition as results arrive —
for exactly the six MVP formats, no more.
## Requirements
### Requirement: Only the six MVP formats are supported
The engine SHALL generate fixtures only for single elimination, double elimination, round robin,
league, round robin single-leg, and round robin home-and-away. It SHALL reject any other format
selection rather than approximating it.

#### Scenario: Unsupported format is rejected at tournament configuration time
- **WHEN** a tournament ruleset selects a format outside the six MVP formats
- **THEN** the engine rejects the configuration with an explicit "unsupported format" error, before any fixture is generated

### Requirement: Deterministic fixture generation
Given the same entrant list, seed assignment, and format, the engine SHALL generate the identical
fixture graph on every run.

#### Scenario: Repeated generation is identical
- **WHEN** fixtures are generated twice from the same entrant list, seeds, and format
- **THEN** both generated fixture graphs are structurally identical, including bye placement

### Requirement: Double-elimination bracket layout is structurally correct
The engine SHALL generate a double-elimination bracket with a distinct winners bracket, losers
bracket, and grand final, correctly routing a losing entrant from the winners bracket into the
correct losers-bracket round.

#### Scenario: A winners-bracket loss routes to the correct losers-bracket slot
- **WHEN** an entrant loses a winners-bracket match in round N
- **THEN** that entrant's next fixture is generated in the losers bracket at the round determined by the double-elimination routing rule, not by the general in-order-traversal tree layout

#### Scenario: Grand final accounts for a losers-bracket-final winner
- **WHEN** the losers-bracket final concludes
- **THEN** the grand final fixture is generated between the winners-bracket champion and the losers-bracket champion, including the bracket-reset condition if the losers-bracket champion wins the first grand-final match

### Requirement: Standings carry a full explanation trace
Every standing produced by this engine SHALL include the explanation trace from phase 3's rules
engine, showing each tiebreak parameter's value and the first comparator that resolved any tie.

#### Scenario: Tied entrants show the resolving comparator
- **WHEN** two entrants are tied after the primary ranking criterion
- **THEN** the standing includes a trace entry naming the specific comparator that broke the tie and the compared values

### Requirement: Advancement is deterministic and format-aware
Given a recorded match result, the engine SHALL deterministically compute which downstream
fixture(s) unlock, correctly for each of the six MVP formats' advancement rules.

#### Scenario: Round-robin advancement recomputes standings, not fixtures
- **WHEN** a round-robin match result is recorded
- **THEN** the engine recomputes standings but does not regenerate the round-robin fixture list

#### Scenario: Elimination advancement populates the next round's slot
- **WHEN** a single- or double-elimination match result is recorded
- **THEN** the engine populates the correct slot of the downstream fixture that depends on this match's winner (and loser, for double elimination)

### Requirement: Fixture regeneration respects mutation classification
Any operation that would alter already-generated fixtures SHALL be classified `safe`,
`requires_rebuild`, or `blocked_after_results` per phase 2's mutation model, and the engine SHALL
enforce that classification.

#### Scenario: Format change after results exist is blocked
- **WHEN** an operator attempts to change a tournament's format after at least one match result has been recorded
- **THEN** the engine rejects the change as `blocked_after_results`, directing the operator to the audited correction workflow instead

