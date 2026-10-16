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
first match of it. Where the stage's graph is persisted, every path that changes an outcome SHALL
populate the persisted fixture's side in the same transaction, through the audited resolution that
recomputes it from structure and recorded outcomes.

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

#### Scenario: Every outcome path populates the persisted side
- **WHEN** a quarter-final of a persisted bracket is decided through finalize, bulk load, a series
  decision or a correction
- **THEN** in that same transaction the semi-final side it feeds reports the resulting entrant, with an
  audit record and an outbox event

Future outcome writers, including a dedicated forfeit endpoint or CSV result importer, SHALL use the
same transactional resolution hook. A static guard SHALL reject unrouted repository outcome writers.

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

### Requirement: Gauntlet (Stepladder) Format Support
The engine SHALL support the `gauntlet` duel format, generating a linear chain of $N-1$ matches for $N$ seeded participants ($2 \le N \le 32$). Match 1 SHALL join Seed $N$ and Seed $N-1$; each subsequent Match $i$ ($2 \le i \le N-1$) SHALL join the winner of Match $i-1$ with Seed $N-i$.

#### Scenario: 5-entrant Gauntlet fixture structure
- **GIVEN** a stage with 5 seeded entrants selecting format `gauntlet`
- **WHEN** fixtures are generated
- **THEN** exactly 4 matches across 4 rounds are generated:
  - Round 1 (M1): Seed 5 vs Seed 4
  - Round 2 (M2): Winner(M1) vs Seed 3
  - Round 3 (M3): Winner(M2) vs Seed 2
  - Round 4 (M4 - Grand Final): Winner(M3) vs Seed 1

#### Scenario: Gauntlet winner advancement
- **GIVEN** a generated 5-entrant Gauntlet stage
- **WHEN** Match 1 concludes with Seed 5 winning
- **THEN** Seed 5 is populated into Slot A of Match 2 against Seed 3
- **AND** losing entrants are ranked in reverse elimination order (Loser M1: 5th place, Loser M2: 4th place, Loser M3: 3rd place, Loser M4: 2nd place, Winner M4: 1st place)

### Requirement: Swiss System Dynamic Round Pairing Generation
The engine SHALL support the `swiss` format. Initial generation SHALL produce Round 1 fixtures pairing the top seed half against the bottom seed half ($1 \text{ vs } N/2+1$, $2 \text{ vs } N/2+2$, etc.). Subsequent rounds SHALL be generated dynamically on request once the prior round is complete, grouping participants into score brackets and finding optimal non-repeat pairings.

#### Scenario: Round 1 seed split
- **GIVEN** a Swiss stage with 8 seeded entrants
- **WHEN** Round 1 fixtures are generated
- **THEN** 4 matches are created pairing Seed 1 vs Seed 5, 2 vs 6, 3 vs 7, and 4 vs 8

#### Scenario: Round 2 groups participants by record
- **GIVEN** 4 winners (1-0) and 4 losers (0-1) from Round 1
- **WHEN** Round 2 is generated
- **THEN** 2 matches pair the 1-0 entrants together and 2 matches pair the 0-1 entrants together
- **AND** no pair repeats a match already played in Round 1

#### Scenario: Odd participant receives a bye
- **GIVEN** a Swiss stage with 7 active entrants
- **WHEN** a round is generated
- **THEN** 3 matches (6 entrants) and 1 bye (1 entrant) are generated
- **AND** the bye awards a walkover win to the lowest-ranked entrant who has not previously received a bye

### Requirement: Custom Bracket (Declarative DAG) Format Support
The engine SHALL support the `custom-bracket` format, generating a fixture graph from a user-supplied list of match definitions. The engine SHALL validate before generation that:
1. Every match identifier is unique within the stage.
2. The graph contains no cycles (strict DAG).
3. Every `winner-of` and `loser-of` reference targets an existing match identifier in an earlier round or preceding topological order.
4. Every `entrant` seed is within the entrant capacity bounds.

#### Scenario: Valid custom DAG generates cleanly
- **GIVEN** a custom bracket definition declaring 7 matches with custom consolation branch labels
- **WHEN** fixtures are generated
- **THEN** the fixture graph is generated with exact round, position, and branch metadata
- **AND** advancement edges resolve upon match completion per the declared links

#### Scenario: Cyclic reference is rejected
- **GIVEN** a custom bracket definition where Match A references winner-of(Match B) and Match B references winner-of(Match A)
- **WHEN** fixture generation is attempted
- **THEN** generation is rejected with an explicit `CyclicFixtureGraphError` before persistence

### Requirement: FFA Elimination Brackets Format Support
The engine SHALL support the `ffa-bracket` and `ffa-bracket-groups` placement formats. Given $N$ entrants, a lobby capacity of $M$, and an advancement count of $K$ ($K < M$), the engine SHALL generate a multi-round knockout fixture tree where the top $K$ finishers from each match advance to downstream round matches.

#### Scenario: 64-player Battle Royale bracket (4 lobbies of 16 -> 1 lobby of 16)
- **GIVEN** 64 entrants, lobby size 16, and advancing count 4 selecting format `ffa-bracket`
- **WHEN** fixtures are generated
- **THEN** Round 1 generates 4 matches (M1, M2, M3, M4) with 16 seeded entrants each
- **AND** Round 2 generates 1 Grand Final match (M5) with 16 slots sourced from top-4 finishers of M1–M4

#### Scenario: Anti-colocation slot distribution
- **GIVEN** Round 1 match M1 has advancing finishers at ranks 1, 2, 3, 4
- **AND** Round 2 has 2 downstream matches (M5 and M6)
- **WHEN** slots are wired
- **THEN** Rank 1 and 3 are mapped to M5, while Rank 2 and 4 are mapped to M6, distributing advancing players across different lobbies

### Requirement: FFA League Multi-Division Format Support
The engine SHALL support the `ffa-league` placement format, generating a multi-round series of $M$-player placement matches for each declared division. Every entrant SHALL participate in a scheduled fixture across each game round, accumulating points into a division standings table.

#### Scenario: 32-player FFA League with 2 divisions of 16 across 5 game days
- **GIVEN** 32 entrants split into Division 1 and Division 2 with 5 game rounds
- **WHEN** fixtures are generated
- **THEN** 10 total placement matches are generated (1 match per division per round)
- **AND** standings compute cumulative placement and performance points independently per division across all 5 rounds

### Requirement: Heterogeneous Zone Fixture Generation and Standings Accounting
Seeding and fixture generation SHALL build one fixture graph per zone from that zone's effective format and series declaration, and persist each fixture with its zone and group scope. A stage whose zones have differing formats SHALL produce knockout brackets for elimination formats and round-robin matrices for league formats, with rounds numbered 1-based within each zone so zones may have different round counts. No fixture or advancement edge SHALL cross a zone boundary. A stage without declared zones SHALL generate exactly the fixtures it generated before this change. Points-based standings SHALL be projected only for zones whose effective format produces tables.

#### Scenario: Stage generates knockout fixtures for some zones and round-robin for others
- **WHEN** seeding publishes a stage where Zone 1 and Zone 2 are `single-elimination` and Zone 3 is `round-robin`
- **THEN** Zone 1 and Zone 2 persist bracket fixtures with progression edges
- **AND** Zone 3 persists a complete round-robin schedule among its own entrants
- **AND** no fixture or edge references an entrant or fixture of another zone

#### Scenario: Stage without declared zones is unchanged
- **WHEN** seeding publishes a stage that has only its implicit zone
- **THEN** the persisted fixtures are identical to those generated before this change

#### Scenario: Per-zone series
- **WHEN** Zone 1 declares a best-of-three series and Zone 3 declares none
- **THEN** Zone 1's fixtures carry three matches each and Zone 3's carry one

#### Scenario: Standings calculation respects zone format
- **WHEN** standings and table projections are requested for a heterogeneous stage
- **THEN** a points table is returned for Zone 3
- **AND** Zone 1 and Zone 2 return bracket progression and no points table

#### Scenario: Stage-wide standings of a heterogeneous stage
- **WHEN** the stage's standings are read without naming a zone or group, as the tournament overview and the TV display do
- **THEN** the rows are those of the zones whose effective format produces a table, each zone ranked on its own
- **AND** no entrant of a bracket zone appears in them

### Requirement: Dynamic round generation is scoped to one zone
Generating the next round of a Swiss or single-elimination stage SHALL pair only the entrants of the targeted zone, SHALL derive the current round and the completion check from that zone's fixtures alone, SHALL feed Swiss pairing only that zone's results, and SHALL persist the new fixtures with that zone's identity. A stage with more than one zone SHALL require the request to name the zone by its number; a stage with one zone or none SHALL behave as it did before. A zone whose effective format does not support dynamic rounds SHALL be refused without affecting other zones. No fixture SHALL pair entrants of different zones.

#### Scenario: Two Swiss zones advance independently
- **WHEN** zone A has finished round 2 and zone B has finished round 1, and the next round is requested for zone B
- **THEN** zone B receives round 2 pairings among its own entrants only
- **AND** zone A is unchanged

#### Scenario: A zone with an incomplete round blocks only itself
- **WHEN** the next round is requested for a zone that has an unfinished match in its current round
- **THEN** the request is refused with the round-incomplete error
- **AND** another zone of the same stage can still generate its next round

#### Scenario: A mixed-format stage can advance its dynamic zone
- **WHEN** a stage has a Swiss zone and a round-robin zone and the next round is requested for the Swiss zone
- **THEN** the round is generated for that zone
- **AND** the round-robin zone is untouched

#### Scenario: A multi-zone stage requires the zone
- **WHEN** the next round is requested for a stage with several zones without naming a zone
- **THEN** the request is refused with an error saying which zones are eligible

#### Scenario: A single-zone stage is unchanged
- **WHEN** the next round is requested for a stage with no declared zones
- **THEN** the behavior is the one it had before zone scoping

#### Scenario: A zone the stage does not have is refused
- **WHEN** the next round is requested for a zone number the stage does not have
- **THEN** the request is refused as not found and nothing is generated

#### Scenario: A zone without dynamic rounds is refused alone
- **WHEN** the next round is requested for a zone whose effective format is round-robin
- **THEN** the request is refused naming the zone
- **AND** the stage's other zones are unaffected

### Requirement: Single elimination may declare placement play
Single-elimination generation SHALL accept an optional placement declaration: none (the default), a
third-place game, or every place. A third-place game takes both semi-final losers. Every place also
classifies each eliminated round's losers through their own bracket fed by `loser-of` edges.
Placement nodes SHALL carry a branch and a placement label, and SHALL be deterministic.

#### Scenario: A third-place game is fed by the semi-final losers
- **WHEN** an eight-entrant single-elimination graph declaring a third-place game is generated
- **THEN** it contains a node labelled third place whose sides are the losers of semi-finals 1 and 2

#### Scenario: Every place classifies the quarter-final losers
- **WHEN** an eight-entrant single-elimination graph declaring every place is generated
- **THEN** besides the main bracket and the third-place game, it contains nodes for places 5 to 8 fed by
  the quarter-final losers, a fifth-place node fed by their winners and a seventh-place node fed by their
  losers

#### Scenario: No declaration is unchanged
- **WHEN** a single-elimination graph is generated without a placement declaration
- **THEN** it is identical, node for node, to the graph generated before this requirement existed

#### Scenario: Placement generation is deterministic
- **WHEN** the same entrants and declaration are generated twice
- **THEN** both graphs have identical node ids, edges and labels

### Requirement: Advancement resolves over persisted nodes as it does over a regenerated graph
Given persisted nodes (each with a node key, its sides' sources, a series span and any contingency)
and recorded outcomes, the engine SHALL resolve every side to the same entrant, or to undecided, that
advancement over the regenerated graph resolves it to. A qualifier source SHALL stay undecided until
an entrant is supplied for it. A contingent bracket reset that is not needed SHALL be reported
not-required.

#### Scenario: Parity with regenerated advancement
- **WHEN** a single- or double-elimination graph with recorded outcomes is resolved both from its
  persisted nodes and from its regenerated graph
- **THEN** every side resolves to the same entrant or to undecided in both

#### Scenario: A series resolves its downstream side once decided
- **WHEN** persisted best-of-three nodes are resolved after the first match of a semi-final is won
- **THEN** the final's side fed by that semi-final is still undecided, and becomes the series winner once
  the series is decided

#### Scenario: An unneeded reset is reported not-required
- **WHEN** a double-elimination graph's first grand final is won by the winners-bracket finalist
- **THEN** the resolver reports the bracket-reset node as not-required

#### Scenario: A qualifier side stays undecided
- **WHEN** a node whose side is sourced from a qualifier position is resolved with no entrant supplied
  for it
- **THEN** that side is undecided, and resolving with an entrant supplied for that position yields that
  entrant

### Requirement: A persisted graph stores each node's identity, position and side sources

A persisted elimination graph SHALL store, for every node, its node key, bracket, round, position,
branch, label and contingency, and for each side its source: a seeded entrant, the winner or loser of
another node (by node key), or a qualifier position. A side SHALL report its entrant once known and
SHALL keep its source after that.

#### Scenario: Position is stored, not inferred

- **WHEN** a persisted graph's fixtures are read back in any order
- **THEN** each reports the node key, round and position it was persisted with

#### Scenario: An undecided side reports its source

- **WHEN** a persisted semi-final fed by quarter-finals 1 and 2 is read before either is decided
- **THEN** its sides report "winner of quarter-final 1" and "winner of quarter-final 2" and no entrant

#### Scenario: A decided side keeps its source

- **WHEN** quarter-final 1 is decided, the zone is resolved, and the semi-final is read
- **THEN** that side reports the winning entrant and still reports that it came from quarter-final 1

#### Scenario: A zone without node keys reads as before

- **WHEN** a zone generated before graphs were persisted is read
- **THEN** its fixtures report the positions and entrants they reported before this requirement existed

### Requirement: Persisted entrants are written only by the audited resolution

The entrants of a persisted graph SHALL be written only by a resolution that recomputes them from
structure and recorded outcomes. It SHALL lock the zone, write only the sides whose entrant changed,
record each change with prior and resulting entrant in the audit trail with an outbox event, and mark
an unneeded contingent node not-required, releasing its slot in the same transaction.

#### Scenario: Resolution writes only what changed

- **WHEN** a zone is resolved twice with no outcome recorded in between
- **THEN** the second resolution writes nothing and records no audit entry

#### Scenario: A change is audited with its prior state

- **WHEN** a resolution changes a semi-final side from undecided to an entrant
- **THEN** an audit record names the semi-final match, the side, the prior state (undecided) and the
  resulting entrant, and an outbox event is published in the same transaction

#### Scenario: Concurrent results both resolve

- **WHEN** both quarter-finals feeding one semi-final are finalized concurrently, each followed by a
  resolution of the zone
- **THEN** after both commit, the semi-final reports both winners

#### Scenario: An unneeded reset frees its slot

- **WHEN** a resolution finds that a persisted bracket-reset match is not needed while it holds a slot
- **THEN** the match becomes not-required and its slot assignment is released in the same transaction

### Requirement: A persisted series is resolved by its declared resolution class

The resolution of a persisted graph SHALL group each node's matches by node and match number, never
by a match identifier format, and SHALL decide a series node with the zone's declared series
resolution class. It SHALL refuse, rather than guess, a series node without a usable declaration.

#### Scenario: A best-of-three series decides its node

- **WHEN** both of a persisted best-of-three final's first two matches are won by the same entrant
- **THEN** a node fed by "winner of the final" reports that entrant

#### Scenario: An aggregate tie advances the aggregate winner

- **WHEN** a persisted two-legged aggregate tie ends 3-0 and 0-1 for the same pair of entrants
- **THEN** the entrant ahead 3-1 on aggregate is the winner of that node

#### Scenario: An unplayed series match keeps the series pending

- **WHEN** only the first match of a persisted best-of-three node is finalized
- **THEN** a node fed by its winner reports that side as pending

#### Scenario: A series without a usable declaration is refused

- **WHEN** a persisted node spans several matches and the zone declares no series, a scripted series,
  or a span different from the node's
- **THEN** resolution fails with an error naming the node and writes nothing

### Requirement: Generating an elimination stage persists its whole graph

Generating a single- or double-elimination stage or zone SHALL persist every node of its graph as a
fixture holding its matches (its whole series span), not only the nodes whose entrants are known. A node
that is structurally a bye SHALL NOT become a fixture. Every persisted match SHALL have its own
identifier from generation onwards.

#### Scenario: An eight-entrant bracket persists seven fixtures

- **WHEN** a single-elimination stage of eight entrants is generated
- **THEN** seven fixtures exist (four quarter-finals, two semi-finals, one final), each holding one match
  with its own identifier, and the semi-finals and the final have both sides undecided

#### Scenario: A bye does not become a fixture

- **WHEN** a single-elimination stage of six entrants is generated
- **THEN** the two first-round byes are not fixtures, and each second-round fixture fed by a bye names the
  seeded entrant on that side from generation onwards

#### Scenario: A series span is materialized on undecided nodes too

- **WHEN** a stage declaring best-of-three series is generated
- **THEN** every fixture, including the undecided final, holds three matches numbered in play order

### Requirement: A stage declares its placement play

A single-elimination stage or zone SHALL declare its placement play in its configuration: none, a
third-place game, or every place. Generation SHALL persist the declared placement nodes like any other
node. Changing the declaration SHALL be classified `requires_rebuild`, and SHALL be blocked once a result
exists.

#### Scenario: A declared third-place game is persisted and schedulable

- **WHEN** a stage declaring a third-place game is generated
- **THEN** a fixture labelled third place exists, sourced from both semi-final losers, and its match can
  be placed in a slot

#### Scenario: Changing placement play after results is blocked

- **WHEN** an organizer changes a stage's placement play after one of its results is recorded
- **THEN** the change is rejected as `blocked_after_results`

### Requirement: A double-elimination bracket reset is a contingent node

A generated double-elimination stage SHALL persist its bracket-reset final as a contingent fixture. When
the winners-bracket finalist wins the first grand final, the reset match SHALL become not-required, and
any slot it held SHALL be released in the same transaction.

#### Scenario: An unneeded reset frees its slot

- **WHEN** the winners-bracket finalist wins the first grand final and the reset match is placed in a
  published slot
- **THEN** the reset match becomes not-required and its slot is free in the same commit

#### Scenario: A needed reset becomes decided

- **WHEN** the losers-bracket finalist wins the first grand final
- **THEN** the reset match's sides resolve to the two finalists and it remains scheduled

### Requirement: Next round is refused for a stage whose graph is persisted

A request for the next round SHALL be refused for a zone whose elimination graph was persisted at
generation, stating that its later rounds already exist. Swiss zones, and elimination zones generated
before graphs were persisted, SHALL keep their current next-round behaviour.

#### Scenario: A persisted bracket refuses next round

- **WHEN** the next round is requested for a single-elimination zone generated with its whole graph
- **THEN** the request is refused, stating that the zone's later rounds already exist, and nothing is
  generated

#### Scenario: A Swiss zone is unaffected

- **WHEN** the next round is requested for a Swiss zone whose current round is complete
- **THEN** the round is generated exactly as before
