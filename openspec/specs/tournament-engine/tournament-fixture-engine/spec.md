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
fixture graph on every run. This holds per group: two entrants in different groups of the same stage
never generate a fixture between them, and generation for one group is independent of every other
group's entrant list, seed assignment, and result.

#### Scenario: Repeated generation is identical
- **WHEN** fixtures are generated twice from the same entrant list, seeds, and format
- **THEN** both generated fixture graphs are structurally identical, including bye placement

#### Scenario: Grouped generation never crosses group boundaries
- **WHEN** a stage's zone is split into more than one group
- **THEN** every generated fixture's two entrants (or every placement match's slots) belong to the
  same group, and no fixture is ever generated between entrants of different groups

### Requirement: A stage with no explicit zone or group still generates unchanged

Fixture generation SHALL resolve a stage's implicit zone and that zone's implicit group when an
operator has created neither, and generation through that implicit pair SHALL be indistinguishable
from generation before zones and groups existed.

#### Scenario: Duel format generation is unaffected by the implicit default
- **WHEN** each of the six duel formats is generated for a stage with no explicit zone or group
- **THEN** the generated fixture graph is byte-for-byte identical to what the same entrant list, seed
  order, and format produced before zones and groups existed

#### Scenario: Placement format generation is unaffected by the implicit default
- **WHEN** either placement format is generated for a stage with no explicit zone or group
- **THEN** the generated fixture graph is byte-for-byte identical to what the same entrant list and
  format produced before zones and groups existed

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
fixture(s) unlock, correctly for each of the six MVP formats' advancement rules. Where a fixture is
settled by a series, the advancement edge SHALL read the series resolution rather than any single
match result, so a `winner-of` edge is populated once — when the series is decided — and not by the
first match of it.

#### Scenario: Round-robin advancement recomputes standings, not fixtures
- **WHEN** a round-robin match result is recorded
- **THEN** the engine recomputes standings but does not regenerate the round-robin fixture list

#### Scenario: Elimination advancement populates the next round's slot
- **WHEN** a single- or double-elimination match result is recorded
- **THEN** the engine populates the correct slot of the downstream fixture that depends on this match's winner (and loser, for double elimination)

#### Scenario: A series does not advance on its first match
- **WHEN** the first match of a best-of-five series is finalized
- **THEN** no downstream slot is populated, because the series that the advancement edge depends on is
  not yet decided

#### Scenario: A decided series populates the downstream slot once
- **WHEN** a best-of-five series becomes decided
- **THEN** the downstream fixture's slot is populated with the series winner exactly once, and the
  later anulling of the unplayed matches populates nothing further

### Requirement: Fixture regeneration respects mutation classification
Any operation that would alter already-generated fixtures SHALL be classified `safe`,
`requires_rebuild`, or `blocked_after_results` per phase 2's mutation model, and the engine SHALL
enforce that classification.

#### Scenario: Format change after results exist is blocked
- **WHEN** an operator attempts to change a tournament's format after at least one match result has been recorded
- **THEN** the engine rejects the change as `blocked_after_results`, directing the operator to the audited correction workflow instead

### Requirement: Generated matches distinguish duel from placement shape
The fixture graph SHALL represent a match as either a duel of exactly two slots or a placement match
of N slots, and the distinction SHALL be explicit in the type rather than inferred from slot count.

#### Scenario: A duel match keeps its advancement edges
- **WHEN** a single-elimination bracket is generated
- **THEN** every generated match is of duel shape and carries the `winner-of`/`loser-of` edges that
  advancement resolves

#### Scenario: A placement match carries no advancement edge
- **WHEN** a placement match is generated
- **THEN** no other match declares a slot sourced from its winner or loser, and advancement
  resolution does not traverse it

### Requirement: Accounting is free of discipline assumptions
Standings accounting SHALL NOT hardcode any statistic name and SHALL NOT require a match to have
exactly two sides.

#### Scenario: A discipline unlike football is accounted correctly
- **WHEN** standings are computed for a discipline declaring only `frags`, `deaths` and
  `placement-points`
- **THEN** those three statistics are aggregated and no football-shaped statistic is emitted

#### Scenario: A regression fixture proves the previous defect is gone
- **WHEN** the tennis group fixture that previously produced an unresolved three-way tie is replayed
- **THEN** the standings resolve the group and the explanation trace shows each comparator reading a
  real value rather than degrading through `missingValue`

### Requirement: The engine supports placement stage formats alongside the duel formats
Stage format generation SHALL accept the two placement formats in addition to the six duel formats,
and SHALL keep the duel formats' generation behaviour unchanged.

#### Scenario: Duel format generation is unaffected
- **WHEN** each of the six duel formats is generated after this phase
- **THEN** the existing golden fixtures for those formats match byte for byte

#### Scenario: A mixed-format tournament generates both stage kinds
- **WHEN** a tournament declares a heats stage followed by a double-elimination stage
- **THEN** the first stage generates placement matches, the second generates duel matches with intact
  advancement edges, and the second is populated from the first through the qualification contract

### Requirement: Advertised format support matches implemented format support
The engine SHALL NOT advertise a stage format it cannot generate.

#### Scenario: The format list is authoritative
- **WHEN** the supported-format list is queried
- **THEN** it contains exactly the formats the engine generates, and every entry has generation
  coverage in the test suite

### Requirement: A stage can be created from a tournament's accepted registrations
The engine SHALL provide an operation that creates a stage in a tournament, drawing its default
entrant pool from the tournament's currently `accepted` registrations. Stage number and name SHALL
default when not supplied (the next sequential stage number in the tournament, and a name derived
from it); the stage's format SHALL default to the tournament's own configured format when not
supplied, and any explicitly supplied format SHALL be validated against the tournament's discipline
descriptor exactly as tournament creation validates it. The operation SHALL refuse to create a stage
whose number already exists in the tournament.

#### Scenario: Stage created with defaults
- **WHEN** an operator creates a stage for a tournament with accepted registrations and supplies
  neither number, name, nor format
- **THEN** the stage is created as the tournament's next sequential stage number, with a derived
  default name, using the tournament's own configured format

#### Scenario: Duplicate stage number is refused
- **WHEN** an operator requests stage creation naming a stage number that already exists in this
  tournament
- **THEN** the operation is refused as a conflict and no stage is created

#### Scenario: Unsupported format is refused
- **WHEN** an operator requests stage creation naming a format the tournament's discipline descriptor
  does not support
- **THEN** the operation is refused before any stage is created

#### Scenario: Stage creation does not itself generate fixtures
- **WHEN** a stage is created
- **THEN** it exists with no matches yet, and generating its bracket is a separate, subsequent
  operation

### Requirement: A stage with no generated fixtures resolves its entrant pool from accepted registrations
Any operation that reads or writes a stage's seed order SHALL resolve the stage's entrant pool from
the tournament's currently `accepted` registrations, in registration order, when the stage has no
generated fixtures yet. Once the stage has generated fixtures, its entrant pool SHALL continue to be
read from those fixtures as before, unaffected by later registration changes.

#### Scenario: A freshly created stage's default seed order is registration order
- **WHEN** an operator requests the seed order of a stage that has accepted registrations but no
  generated fixtures
- **THEN** the returned seed order lists exactly the accepted entrants, in the order they registered

#### Scenario: The first seed order can be published
- **WHEN** an operator publishes a seed order naming exactly the stage's accepted registrations for a
  stage with no generated fixtures yet
- **THEN** the operation succeeds and generates the stage's fixture graph

#### Scenario: A stage that already has fixtures is unaffected by later registration changes
- **WHEN** a stage already has generated fixtures and a registration is accepted or withdrawn
  afterward
- **THEN** the stage's entrant pool continues to reflect its generated fixtures, not the tournament's
  current registration list

### Requirement: Generating a fixture materializes the match it holds
Generating a stage's fixtures SHALL create, in the same transaction, the match each fixture holds,
numbered from 1 within that fixture. A generated fixture SHALL NOT exist without the match it is a cross
for, so every surface that names a match names a real one and every playable unit exists to be scheduled.

#### Scenario: Generation produces a match per fixture
- **WHEN** a stage's fixtures are generated
- **THEN** each generated fixture holds exactly one match, numbered 1, created in the same transaction as
  the fixture

#### Scenario: A fixture holds each match number once
- **WHEN** the match numbered 1 of a fixture is requested a second time
- **THEN** the fixture's existing match is returned rather than a second one being created, and the
  fixture still holds exactly one match

#### Scenario: Every surface reads a real match identifier
- **WHEN** a projection reports a generated fixture's match
- **THEN** it reports that match's own identifier, not the fixture's identifier standing in for one

### Requirement: Regeneration replaces matches only while none has progressed
Regenerating a stage's fixtures SHALL replace the matches those fixtures held along with the fixtures
themselves, and the schedule assignments those matches held. It SHALL refuse when any of those matches has
progressed beyond being scheduled — a recorded result, or a status other than scheduled — directing the
operator to the audited correction workflow, exactly as the mutation classification it already enforces
requires.

#### Scenario: Regeneration before any match starts succeeds
- **WHEN** a stage whose matches are all still scheduled is reseeded
- **THEN** the previous fixtures, their matches, and their schedule assignments are replaced by the newly
  generated ones, and each new fixture again holds exactly one match with no assignment

#### Scenario: Regeneration after a match has started is refused
- **WHEN** a stage is reseeded and one of its matches is in progress or has a recorded result
- **THEN** the regeneration is refused and no fixture, match, or assignment of that stage is altered

#### Scenario: Regeneration frees the slots its matches held
- **WHEN** a stage whose matches are placed in slots is reseeded
- **THEN** those slots become free, and the schedules holding them are otherwise unchanged

### Requirement: Generation is deterministic over series
Generating a stage whose fixtures declare a series SHALL be deterministic in the same sense
single-match generation already is: the same entrants, seeds, format and series declaration SHALL
produce the identical set of matches, in the same play order, with the same home-side alternation, on
every run. Series generation SHALL respect group boundaries exactly as single-match generation does.

#### Scenario: Repeated series generation is identical
- **WHEN** fixtures for a stage declaring a best-of-five series are generated twice from the same
  entrants, seeds and format
- **THEN** both runs produce structurally identical fixtures, including each fixture's match count,
  match numbering, and home-side assignment per match

#### Scenario: Series generation never crosses group boundaries
- **WHEN** a stage declaring a series is split into more than one group
- **THEN** every match of every generated series joins two entrants of the same group

### Requirement: The supported-format list is unchanged by series
A series SHALL NOT be a stage format. The set of formats the engine advertises and generates SHALL be
exactly what it was before series existed, and a series SHALL be declared on top of a supported duel
format rather than in place of one.

#### Scenario: The advertised format list gains no entry
- **WHEN** the supported-format list is queried after series are available
- **THEN** it contains exactly the same formats it contained before, and no series-named entry

#### Scenario: A series is declared on top of a duel format
- **WHEN** a stage declares the double-elimination format together with a best-of-three series
- **THEN** the stage generates a double-elimination bracket whose every fixture holds three matches,
  and the bracket structure is the one that format already generates

### Requirement: Bracket Groups (GSL Dual Tournament) Format Support
The engine SHALL support the `bracket-groups` duel format, generating an independent dual-tournament or single-elimination mini-bracket for each group in a stage. In the default 4-entrant GSL configuration, each group SHALL generate exactly 5 matches with declarative advancement edges:
1. Match 1 (Opening A): Seed #1 vs Seed #4.
2. Match 2 (Opening B): Seed #2 vs Seed #3.
3. Match 3 (Winners' Match): Winner of Match 1 vs Winner of Match 2 $\to$ Winner qualifies as Seed #1.
4. Match 4 (Elimination Match): Loser of Match 1 vs Loser of Match 2 $\to$ Loser is eliminated in 4th place.
5. Match 5 (Decider Match): Loser of Match 3 vs Winner of Match 4 $\to$ Winner qualifies as Seed #2; loser is eliminated in 3rd place.

#### Scenario: GSL dual-tournament bracket generation
- **GIVEN** a stage with 4 seeded entrants selecting format `bracket-groups`
- **WHEN** fixtures are generated
- **THEN** exactly 5 matches are generated across 3 rounds (Round 1: Opening A & B; Round 2: Winners & Elimination; Round 3: Decider)
- **AND** advancement edges strictly wire winners and losers without requiring external manual bracket adjustments

#### Scenario: Multiple bracket groups operate independently
- **GIVEN** a stage with 16 entrants split into 4 groups of 4 selecting `bracket-groups`
- **WHEN** fixtures are generated
- **THEN** 4 independent 5-match brackets are generated (total 20 matches)
- **AND** the top 2 finishers from each group (total 8 entrants) qualify into the subsequent playoff stage
