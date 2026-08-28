# tournament-engine/match-series Specification

## Purpose
Expresses a cross between two entrants that takes more than one match to settle — a two-legged tie
decided on aggregate, a best-of-five play-off, a home-and-away final played weeks apart at different
venues — as one advancement decision made from several recorded results.

## Requirements

### Requirement: A fixture is settled by one match or by a declared series
A fixture between two entrants SHALL be settled either by a single match, which remains the default, or
by a series of matches when the effective configuration declares one. A fixture that declares no series
SHALL generate exactly one match and behave identically to a fixture generated before series existed.
The matches of a series SHALL be identified as belonging to it by the fixture carried explicitly on
every recorded outcome the accounting engine reads; membership SHALL NOT be inferred from the shape,
formatting or any substring of a match identifier.

#### Scenario: A fixture with no declared series is unchanged
- **WHEN** fixtures are generated for a stage whose configuration declares no series
- **THEN** each fixture holds exactly one match, and the generated graph is identical to the graph the
  same entrants, seeds and format produced before series were introduced

#### Scenario: A declared series generates its full complement of matches
- **WHEN** a stage declares a best-of-five series
- **THEN** each fixture of that stage holds five matches, numbered in play order, each independently
  addressable for scheduling and result recording

#### Scenario: A series joins exactly two entrants
- **WHEN** a series is declared on a stage whose format produces placement matches
- **THEN** the configuration is rejected with an explicit error, because a series settles a cross
  between two sides and a placement match has no two sides to settle

#### Scenario: Series membership survives an opaque match identifier
- **WHEN** the matches of a series carry identifiers with no ordinal suffix, no shared prefix and no
  recoverable sequence
- **THEN** accounting still groups them into the one series they belong to, because membership is
  carried on the outcome rather than parsed out of the identifier

### Requirement: Resolution classes are core-owned, with a scripted escape
The engine SHALL own a closed set of series resolution classes and SHALL evaluate them itself:
`best-of`, where the first side to a declared majority of matches wins; `aggregate`, where the summed
score across every played match decides; and `points-per-leg`, where each match awards points by the
stage's points rule and the higher total wins. A series whose rule none of these classes expresses
SHALL declare a script instead, evaluated through the rules engine's series-resolution hook. A series
SHALL declare exactly one of a class or a script.

#### Scenario: A best-of series is decided by majority
- **WHEN** one side has won more than half the matches of a `best-of` series
- **THEN** the series is resolved in that side's favour

#### Scenario: A two-legged tie is decided on aggregate
- **WHEN** both matches of a two-match `aggregate` series are finalized
- **THEN** the series is resolved for the side whose summed score across the two matches is higher

#### Scenario: An aggregate series that ends level is not resolved
- **WHEN** both matches of an `aggregate` series are finalized and the summed scores are equal
- **THEN** the series is reported as finished but unresolved, naming the equality as the reason, and no
  advancement edge is populated until an authorized operator action or a declared further criterion
  settles it

#### Scenario: A declared class and a script together are refused
- **WHEN** a series declares both a resolution class and a resolution script
- **THEN** the configuration is rejected before any fixture is generated

#### Scenario: A scripted series resolves through the rules engine
- **WHEN** a series declares a resolution script and every match it needs is finalized
- **THEN** the script is evaluated with each match's result, sides and statistics available in its
  context, and its declared outcome resolves the series

### Requirement: A series states when it is decided, and the matches it no longer needs are anulled
A series SHALL be evaluated after every match finalization and SHALL report whether it is decided. When
a series is decided while matches remain unplayed, those matches SHALL be moved to a terminal
not-required state rather than deleted, and the slot each occupied SHALL be freed — its assignment
removed, the slot and its schedule otherwise untouched and available to any other match. The transition
SHALL be a recorded fact naming both the series result that caused it and the slot each match vacated, so
a surface can still state where a match would have been played after it no longer holds it.

#### Scenario: A best-of-five decided in three anulls the remaining two
- **WHEN** one side wins the first three matches of a best-of-five series
- **THEN** matches four and five move to the not-required state, the slots they occupied are freed, and
  the recorded fact names the three-nil series result as the cause and the slot each match vacated

#### Scenario: An anulled match is not a deleted match
- **WHEN** the matches of a decided series are read back after being anulled
- **THEN** every one of them still exists, still carries its number, still names the slot it had
  occupied, and states that it was not required

#### Scenario: An anulled match accepts no result
- **WHEN** an operator attempts to start or record a result against a not-required match
- **THEN** the command is refused, because the record would be incoherent — the series it belongs to is
  already settled

#### Scenario: A series still alive anulls nothing
- **WHEN** a best-of-five series stands at two matches to one
- **THEN** matches four and five keep their slots, and nothing is anulled

#### Scenario: A freed slot is available to another match
- **WHEN** a slot is freed by a series decision
- **THEN** the slot and its schedule are unchanged apart from being empty, and another match may be placed
  in it

### Requirement: Sides alternate across the matches of a series
Which side is at home in each match of a series SHALL be generated rather than operator-entered,
alternating from the first match onward, so that the home indication in a series carries the meaning it
already carries in a round-robin second leg. A series played on neutral ground SHALL declare so, and
its matches SHALL carry no home side at all rather than an arbitrary one.

#### Scenario: A two-legged tie reverses sides in the second leg
- **WHEN** a two-match series is generated for entrants A and B
- **THEN** A is at home in the first match and B is at home in the second

#### Scenario: A best-of-five alternates across all five
- **WHEN** a five-match series is generated for entrants A and B
- **THEN** the home side alternates A, B, A, B, A across the five matches

#### Scenario: A neutral series has no home side
- **WHEN** a series is declared to be played on neutral ground
- **THEN** none of its matches states a home side, and a rule that compares home and away reads both as
  absent rather than inventing either

### Requirement: The ruleset declares what a resolved series contributes to accounting
The effective ruleset SHALL declare whether a series contributes one outcome to standings and statistic
accounting or one outcome per played match. Neither SHALL be assumed: a play-off series that decides a
bracket edge while still producing per-match player statistics and a two-legged tie that produces a
single aggregate result are both intended uses. A declaration that names no grain SHALL account per
match, and every surface that displays such a table SHALL state the grain it is showing rather than
leave a reader to infer it.

Under series-grain accounting a statistic the discipline declares with `count` aggregation SHALL be
folded once per resolved series, so that a table's counted total and its win/draw/loss totals are in the
same unit. Under match-grain accounting it SHALL be folded once per played match. Statistics the
discipline declares with any other aggregation SHALL fold every played match's value under either grain,
because a goal scored in game two was scored whatever a standings row is counted in.

#### Scenario: A series declared to contribute one outcome
- **WHEN** a five-match series is resolved under a ruleset declaring series-grain accounting
- **THEN** standings account one result for the winning side and one for the losing side, not five

#### Scenario: A series declared to contribute per match
- **WHEN** a five-match series is resolved under a ruleset declaring match-grain accounting
- **THEN** standings account every played match as its own result, and the matches that were never
  played contribute nothing

#### Scenario: A counted total is in the same unit as the results beside it
- **WHEN** a best-of-three that went the distance is accounted under series-grain accounting
- **THEN** the winning side's counted total reads one, and that total equals the sum of its wins, draws
  and losses

#### Scenario: A counted total follows match grain when match grain is declared
- **WHEN** the same best-of-three is accounted under match-grain accounting
- **THEN** the winning side's counted total reads three, and that total equals the sum of its wins,
  draws and losses

#### Scenario: Statistic collectors fold every played match regardless of the declared grain
- **WHEN** statistics are collected over a resolved series under either declared grain
- **THEN** every fact recorded in every played match is folded exactly once, because a player's goals
  in game two happened whatever the standings grain says

#### Scenario: A grain that is not declared is reported, not silently chosen
- **WHEN** standings are computed for a stage whose series declaration names no accounting grain
- **THEN** accounting proceeds per match and the calculation reports that it did, so the choice is
  visible to every surface reading it

### Requirement: Series resolution is explainable
A resolved series SHALL carry an explanation trace on the same contract standings and win conditions
already use, stating the resolution class or script that decided it, the per-match values it read, and
the point at which it became decided. An unresolved series SHALL state why it is not resolved.

#### Scenario: An aggregate resolution shows its arithmetic
- **WHEN** the trace of a resolved `aggregate` series is read
- **THEN** it names the class, lists each match's score per side, and states the summed totals that
  decided it

#### Scenario: An undecided series states what it is waiting for
- **WHEN** the trace of a best-of-five series standing at two-all is read
- **THEN** it states that no side has reached the majority and names how many further wins each side
  needs

### Requirement: A stage may hold a single series between two entrants
A stage whose entrant pool is two SHALL be a valid stage, and its entire content MAY be one series.
This is the shape a standalone final, a promotion play-off, or a relegation tie takes, and it SHALL NOT
require an artificial bracket around it.

#### Scenario: A two-entrant stage generates one series
- **WHEN** a stage holding two entrants declares a best-of-five series
- **THEN** the stage generates exactly one fixture holding five matches, and no bracket rounds beyond it

#### Scenario: The winner of a single-series stage is available to the next stage
- **WHEN** the single series of a two-entrant stage resolves
- **THEN** the stage completes and its qualification cut orders the two entrants by the series result,
  available to the next stage exactly as any other stage's cut is

### Requirement: Series configuration is classified for mutation
Declaring, removing, or changing the shape of a series SHALL be classified `safe`,
`requires_rebuild`, or `blocked_after_results` per the domain's mutation model, and the classification
SHALL be enforced. Changing the declared accounting grain SHALL be classified alongside the other
series fields and SHALL be reported before it is applied.

#### Scenario: Lengthening a series before it starts rebuilds it
- **WHEN** an operator changes a stage from best-of-three to best-of-five before any match of the
  affected series has a result
- **THEN** the change is classified `requires_rebuild`, the additional matches are generated, and the
  operator is told which generated data changed

#### Scenario: Shortening a series after a result exists is blocked
- **WHEN** an operator attempts to change a stage from best-of-five to best-of-three after a match of
  the affected series has been finalized
- **THEN** the change is rejected as `blocked_after_results`, directing the operator to the audited
  correction workflow

#### Scenario: Changing the resolution class after a result exists is blocked
- **WHEN** an operator attempts to change a series from `best-of` to `aggregate` after a match of that
  series has been finalized
- **THEN** the change is rejected as `blocked_after_results`

#### Scenario: Changing the accounting grain after a result exists is classified before it is applied
- **WHEN** an operator proposes changing a stage's series accounting grain after a match of that series
  has been finalized
- **THEN** the proposal is classified and reported, naming that already-published standings are counted
  in the current grain, before anything is written
