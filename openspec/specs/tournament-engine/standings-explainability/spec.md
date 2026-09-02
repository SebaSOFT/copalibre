# standings-explainability Specification

## Purpose
Renders competition standings so every ranking and every tiebreak resolution is traceable to the
engine's own explanation trace, never a UI-only recomputation or approximation.

## Requirements

### Requirement: Standings table renders engine-sourced ranking
The system SHALL render a standings table (rank, participant, matches, win-draw-loss, points, and a
tiebreak indicator) populated from the published standings projection, not from a client-side
recalculation of raw match results. A column counting played units SHALL be labelled in the unit the
declared accounting grain counts it in, so a column reading one beside a win reading one is not
mistaken for a table that has lost four matches' worth of data.

#### Scenario: Standings reflect the latest published projection
- **WHEN** an operator opens a tournament's standings view
- **THEN** the rendered ranking matches the current `projectionVersion` returned by the standings API

#### Scenario: A counted column is labelled in the unit it counts
- **WHEN** the standings of a stage declaring series-grain accounting are rendered
- **THEN** the column counting played units is labelled as counting series, not matches

### Requirement: A standings table states the unit its rows are counted in
A standings table computed for a stage that declares a series SHALL state, in text, whether its rows
count one result per series or one result per played match. The statement SHALL be present in the
rendered output rather than left to a reader to infer from the numbers, and SHALL be present on every
surface the table appears on.

A table for a stage that declares no series SHALL state nothing: there is only one unit a single-match
stage can be counted in, and a badge announcing it would be noise on every table the product has ever
rendered.

#### Scenario: A series-grain table says so
- **WHEN** an operator or a spectator views the standings of a stage whose series declares series-grain
  accounting
- **THEN** the table states that a series counts as one result, alongside the table itself

#### Scenario: A match-grain table says so, including when the grain was never declared
- **WHEN** the same view is opened for a stage whose series declares match-grain accounting, or names
  no grain at all
- **THEN** the table states that each played match counts as its own result

#### Scenario: A stage with no series is unchanged
- **WHEN** the standings of a stage declaring no series are viewed
- **THEN** no grain statement is rendered, and the table is identical to one rendered before accounting
  grain existed

#### Scenario: The grain survives without JavaScript and without color
- **WHEN** a public standings table for a series stage is rendered with JavaScript disabled and in
  grayscale
- **THEN** the grain statement is present in the server-rendered HTML and legible from its text alone

### Requirement: Expandable tiebreaker resolution trace
Each standings row involved in a resolved tie SHALL expand to show a rule-by-rule tiebreaker
resolution trace, and that trace's text SHALL be sourced verbatim from the rules engine's
explanation-trace output for that ranking calculation.

#### Scenario: Trace matches engine output exactly
- **WHEN** an operator expands a tied row's tiebreaker trace
- **THEN** the rendered trace text is byte-for-byte identical to the `packages/rules` explanation
  trace returned for the same standings calculation on the same fixture

#### Scenario: Untied row has no trace to expand
- **WHEN** a row's ranking was not affected by any tiebreak comparator
- **THEN** the row shows no tiebreaker trace affordance

### Requirement: A series-grain row's trace names the series behind each counted result
Under series-grain accounting, the explanation trace for a standings row SHALL name each series that
contributed a result to it, the matches that series consumed, and the side it settled on. A reader
SHALL be able to reconcile a row's counted total against the crosses they watched without recomputing
anything.

#### Scenario: A counted result names its series
- **WHEN** a standings row accounted one win under series-grain accounting is traced
- **THEN** the trace names the series that produced that win, the games it consumed, and the side it
  settled on

#### Scenario: A counted total reconciles against the trace
- **WHEN** a row counted under series-grain accounting is traced
- **THEN** the number of results the trace names equals the row's counted total, so a table showing one
  played and one won is explained by exactly one named series

#### Scenario: The trace text is the engine's own
- **WHEN** a series-grain trace is rendered on any surface
- **THEN** its text is sourced verbatim from the engine's explanation-trace output for that calculation,
  never composed by the surface rendering it

### Requirement: Non-color-redundant tiebreak indicator
The tiebreak indicator SHALL be distinguishable without relying on color alone (icon plus text
label), consistent with the accessibility rules in `copalibre-visual-identity.md`.

#### Scenario: Tiebreak indicator is legible without color
- **WHEN** the standings table is rendered in grayscale
- **THEN** every tiebreak indicator remains distinguishable via its icon and text label

### Requirement: Table layout projections evaluate compound metrics and multi-column sorting

The system SHALL evaluate declared `TableLayoutDefinition` rules dynamically against precomputed `statistic_totals` and competition records, computing ratios, fractions, and multi-column sort rankings on demand.

#### Scenario: A table layout computes composite fraction cells
- **WHEN** a table column defines `source: { kind: 'composite', numerator: 'penalties-scored', denominator: 'penalties-taken' }` and `format: 'fraction'`
- **THEN** the rendered row outputs `"4/5"` corresponding to the actor's folded totals

#### Scenario: A table layout applies qualification filters
- **WHEN** a goalkeeper ranking layout specifies `filter: { minSamples: { collectorCode: 'player-appearances', min: 3 } }`
- **THEN** actors with fewer than 3 matches played are excluded from the ranking table

#### Scenario: A table layout resolves multi-column sort precedence
- **WHEN** a layout specifies `defaultSort: [{ columnCode: 'goals', direction: 'desc' }, { columnCode: 'goals-per-match', direction: 'desc' }, { columnCode: 'penalties', direction: 'asc' }]`
- **THEN** tied goal scorers are ordered secondarily by goals-per-match and tertiarily by fewest penalty goals

### Requirement: Head-to-Head (H2H) and Match-Losses Tiebreak Scoping
The system SHALL support declaring an evaluation scope (`overall`, `head-to-head`, or `match-losses`) on each tiebreak parameter in a tournament profile or ruleset pipeline. When evaluating a parameter scoped to `head-to-head`, the engine SHALL calculate accounting metrics strictly from recorded match outcomes played among the mutually tied participants. When evaluating a parameter scoped to `match-losses`, the engine SHALL calculate accounting metrics strictly from matches each tied participant lost.

#### Scenario: Head-to-Head points resolves a tie among equal overall points
- **GIVEN** Entrant A and Entrant B have identical overall points in a round-robin group
- **AND** Entrant A defeated Entrant B in their direct match
- **WHEN** the tiebreak pipeline evaluates a parameter with `id: "points"` and `scope: "head-to-head"`
- **THEN** Entrant A is ranked above Entrant B
- **AND** the explanation trace states that H2H points separated Entrant A and Entrant B

#### Scenario: Match-losses scope filters metrics to lost matches
- **GIVEN** Entrant A and Entrant B are tied on overall wins
- **WHEN** evaluating a parameter with `id: "goals-conceded"` and `scope: "match-losses"`
- **THEN** only goals conceded in matches where the respective entrant lost are summed for comparison

### Requirement: Recursive Sub-Tie Resolution for Multi-Entrant Ties
When three or more entrants are tied and a tiebreaker comparator separates a subset of them (e.g. separating the top entrant while two entrants remain tied), the engine SHALL recursively restart the evaluation of the tiebreaker pipeline strictly among the remaining tied participants.

#### Scenario: Three-way tie partially resolved triggers recursive H2H sub-evaluation
- **GIVEN** Entrants A, B, and C are tied on 6 points in a group
- **AND** H2H goal difference ranks Entrant A 1st (+2), while Entrants B and C remain tied (+0)
- **WHEN** the tiebreak pipeline proceeds to resolve Entrant B and Entrant C
- **THEN** a new sub-pipeline evaluation begins strictly between Entrants B and C, evaluating their direct head-to-head match
- **AND** the explanation trace records both the 3-way parent resolution and the nested 2-way sub-resolution

### Requirement: Strength-of-Schedule (Buchholz & Median-Buchholz) Standings Evaluation
The system SHALL evaluate Strength-of-Schedule (SoS) tiebreaker comparators by traversing the stage match graph and aggregating the final points achieved by each entrant's opponents. The engine SHALL support:
1. Standard Buchholz (sum of all opponents' stage points).
2. Scoped Buchholz (sum of points of opponents against whom the entrant won, drew, or lost).
3. Median-Buchholz (sum of opponents' points after excluding the highest and lowest scoring opponent).

#### Scenario: Buchholz resolves tie based on opponent strength
- **GIVEN** Entrant A and Entrant B are tied on 9 points
- **AND** Entrant A played opponents whose final point total sum is 28
- **AND** Entrant B played opponents whose final point total sum is 24
- **WHEN** the tiebreak pipeline evaluates a `buchholz` comparator
- **THEN** Entrant A is ranked ahead of Entrant B
- **AND** the explanation trace enumerates Entrant A's opponents and their point contributions (sum: 28)

#### Scenario: Median-Buchholz trims highest and lowest outliers
- **GIVEN** Entrant A faced opponents with final points [12, 10, 8, 2] (total: 32)
- **WHEN** evaluating `median-buchholz`
- **THEN** the highest (12) and lowest (2) scores are trimmed, yielding an effective score of 18 (10 + 8)
- **AND** the trace explicitly states which opponent scores were trimmed

### Requirement: Sonneborn-Berger / Neustadtl Tiebreak Evaluation
The system SHALL support the Sonneborn-Berger tiebreaker metric, computed as the sum of final points of all defeated opponents plus half the final points of all drawn opponents ($\sum \text{Points}(W) + 0.5 \times \sum \text{Points}(D)$).

#### Scenario: Sonneborn-Berger rewards quality of victories
- **GIVEN** Entrant A and Entrant B are tied on points
- **AND** Entrant A defeated the 1st-place team (12 pts) and lost to others
- **AND** Entrant B defeated the 8th-place team (3 pts) and lost to others
- **WHEN** the pipeline evaluates `sonneborn-berger`
- **THEN** Entrant A's score is 12 and Entrant B's score is 3, placing Entrant A ahead
