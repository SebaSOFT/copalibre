# stage-qualification Specification

## Purpose
Connects one stage's completed standings to the next stage's entrant list and seed order, under the
operator's chosen allocation mode, with the same explainability the standings themselves carry —
TMS-012.

## Requirements
### Requirement: Entrants carry operator-supplied tournament-scoped attributes
An operator SHALL be able to attach numeric and categorical attributes to an entrant when loading it
into a tournament, and those attributes SHALL be scoped to that tournament.

#### Scenario: A ranking is supplied while loading teams
- **WHEN** an operator loads entrants and supplies a numeric `ranking` for each
- **THEN** the ranking is stored against those entrants for this tournament and is available to
  seeding without affecting the same entrants in any other tournament

#### Scenario: Categorical attributes are stored without interpretation
- **WHEN** an operator supplies `region=san-juan` for several entrants
- **THEN** the value is stored verbatim and the system attaches no meaning to it beyond matching

### Requirement: A stage is filled by one of three allocation modes
A stage SHALL declare whether its entrants and seed order come from automatic qualification, manual
placement, or a weighted entrant attribute.

#### Scenario: Automatic allocation from the qualification cut
- **WHEN** a stage declares automatic allocation and the prior stage completes
- **THEN** the qualified entrants fill the stage in cut order

#### Scenario: Weighted allocation ignores qualification order
- **WHEN** a stage declares allocation weighted by the `ranking` attribute
- **THEN** seed order follows the ranking values, not the order entrants emerged from the prior stage

#### Scenario: Manual allocation overrides and is audited
- **WHEN** an operator manually places an entrant into a seed position
- **THEN** the placement is applied and recorded in the audit trail with the acting operator

### Requirement: Qualification is evaluated by the tiebreak comparator pipeline
A qualification cut SHALL be declared as a comparator sequence evaluated against stage standings, and
SHALL produce the same class of explanation trace the standings produce.

#### Scenario: A multi-criteria cut resolves and explains itself
- **WHEN** a cut declares most frags, then fewest deaths, and sixteen entrants must be selected
- **THEN** exactly sixteen qualify and the trace names each comparator and the values it compared

#### Scenario: A participant who missed the cut can be told why
- **WHEN** an entrant finishes immediately below the cut line
- **THEN** the trace shows which comparator separated it from the last qualifying entrant

#### Scenario: A ratio criterion handles a zero denominator explicitly
- **WHEN** a cut ranks by K/D ratio and an entrant recorded zero deaths
- **THEN** the declared zero-denominator behaviour is applied and named in the trace, rather than
  producing an infinite or undefined value

### Requirement: A tie at the cut line is never silently broken
When the comparator sequence is exhausted and entrants remain tied across the cut line, the cut SHALL
report as unresolved rather than selecting arbitrarily.

#### Scenario: An unresolved cut blocks automatic progression
- **WHEN** two entrants remain tied for the final qualifying position after every comparator
- **THEN** the cut is reported unresolved, the next stage is not populated, and the operator is
  offered a declared resolution or an audited override

### Requirement: Qualification reads stage standings, not individual match results
A qualification cut SHALL be computed from aggregated stage standings.

#### Scenario: Aggregate performance decides, not position within one match
- **WHEN** entrants compete in separate heats of differing strength and qualification is declared on
  aggregate performance
- **THEN** entrants qualify on their aggregated standings values regardless of their position within
  their own heat

### Requirement: Stage completion gates next-stage generation
The next stage's fixtures SHALL NOT be generated until the prior stage is marked complete and its
qualification output is resolved.

#### Scenario: Next stage blocked on incomplete prior stage
- **WHEN** an operator attempts to generate the next stage's fixtures while the prior stage still has
  unresolved matches
- **THEN** the system rejects the request and identifies which matches remain unresolved

### Requirement: Advancement preview without commitment
An operator SHALL be able to preview which entrants would currently qualify from an in-progress stage
without generating or committing the next stage's fixtures.

#### Scenario: Preview does not mutate state
- **WHEN** an operator requests a qualification preview mid-stage
- **THEN** the preview reflects current standings and no next-stage fixture or seed assignment is
  created as a result

### Requirement: Group promotion combines several groups' cuts into one ordered list

When a zone's stage is split into groups, a promotion plan SHALL declare how many entrants advance
from each group — a single count applying to every group, or a distinct count per group — and how
entrants promoted from different groups combine into one ordered list for the next stage's seeding.
The combination SHALL be one of: a declared comparator pipeline ranking same-finishing-position
cohorts against each other, explicit operator placement, or simple group-then-rank order. A group's
own cut SHALL resolve before its entrants are eligible for cross-group combination.

#### Scenario: Groups of different sizes promote different counts
- **WHEN** a zone has one group of eight entrants and one of six, and the promotion plan declares two
  advancing from the eight-entrant group and one from the six-entrant group
- **THEN** exactly three entrants are promoted, in the counts the plan declared per group

#### Scenario: Same-position cohorts are ranked by a declared comparator
- **WHEN** a promotion plan declares `ranked` combination by points then goal difference, and two
  groups each promote their top two
- **THEN** the two group winners are ordered against each other by that comparator, the two runners-up
  are ordered against each other by the same comparator, and the combined list lists both winners
  before either runner-up

#### Scenario: Hand-picked combination is audited like any manual placement
- **WHEN** a promotion plan declares manual combination and an operator supplies the cross-group order
- **THEN** the supplied order is applied and recorded in the audit trail with the acting operator,
  exactly as a manual seed placement already is

#### Scenario: A group's own contested cut blocks cross-group combination
- **WHEN** one group in a zone has an unresolved tie at its own cut line
- **THEN** the promotion plan's cross-group combination is refused until that group's cut is resolved,
  rather than combining around it

#### Scenario: The combined list feeds seeding unchanged
- **WHEN** a promotion plan's combination resolves and declares no bands
- **THEN** the resulting ordered list is usable directly as the next stage's one implicit zone's
  automatic-allocation qualification order, with no additional transformation

### Requirement: A promotion plan may route its combined list to several zones of the next stage

A `PromotionPlan` MAY declare `bands` — an ordered list of `{ zoneRef, count }` pairs partitioning the
already-combined, already-ordered list into contiguous runs, each routed to the named zone of the next
stage. A plan that declares no bands SHALL route its entire combined list to the next stage's one
implicit zone, unchanged from the plan's behavior before bands existed.

#### Scenario: A terminal phase splits its promotion into two zones
- **WHEN** a zone's groups promote eight entrants combined into one ranked list, and the next phase's
  promotion plan declares `bands: [{ zoneRef: 'copa-oro', count: 4 }, { zoneRef: 'copa-plata', count: 4
  }]`
- **THEN** the top four of the combined list seed the `copa-oro` zone's automatic allocation and the
  next four seed the `copa-plata` zone's, each independently, and the next phase generates no fixtures
  outside those two zones from this promotion

#### Scenario: Bands never imply a further phase
- **WHEN** a promotion plan's bands route entrants into a terminal phase's zones
- **THEN** nothing about declaring or resolving bands requires, implies, or schedules any further phase

#### Scenario: A band naming an undeclared zone is rejected
- **WHEN** a promotion plan's `bands` names a `zoneRef` that does not correspond to a zone declared (or
  implicitly defaulted) on the next stage
- **THEN** evaluating the plan is rejected identifying the unknown zone, rather than silently dropping
  that band's entrants

#### Scenario: Band counts must exactly account for the combined list
- **WHEN** a promotion plan's `bands` counts sum to fewer or more entrants than the combined list
  contains
- **THEN** evaluating the plan is rejected identifying the mismatch, rather than silently truncating or
  under-filling a zone

#### Scenario: Evaluating a promotion plan is a preview, never a trigger
- **WHEN** an officer requests a promotion plan's combined list at any point, including mid-phase
  before every group has finished
- **THEN** the system returns the list computed from current standings and writes nothing, generates
  no next-stage fixture, and starts no seeding

#### Scenario: Generating the next stage remains a separate, explicit act
- **WHEN** a promotion plan's combined list is fully resolved
- **THEN** the next stage's fixtures are still not generated until an officer explicitly requests it
