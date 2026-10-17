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
qualification output is resolved, unless they are generated ahead from a reviewed promotion plan with
qualifier-sourced sides. In that case the prior stage's completion and a resolved qualification gate
the resolution of those sides, not the generation of the structure.

#### Scenario: Next stage blocked on incomplete prior stage
- **WHEN** an operator attempts to generate the next stage's fixtures while the prior stage still has
  unresolved matches
- **THEN** the system rejects the request and identifies which matches remain unresolved

#### Scenario: Structure ahead, entrants gated
- **WHEN** an operator generates the next stage ahead from a reviewed promotion plan while the prior
  stage still has unresolved matches
- **THEN** the structure is generated with undecided qualifier-sourced sides, and resolving them is
  refused until the prior stage is complete, identifying which matches remain unresolved

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

### Requirement: A published profile declares a default allocation per stage
A `TournamentProfile`'s stage SHALL be able to declare a default `StageAllocation` (automatic,
manual, or weighted with attribute and direction). Instantiating a tournament from a profile whose
stage declares a default SHALL carry that default onto the created `StageConfiguration.allocation`,
unless the instantiating operator explicitly overrides it. A stage declaring no default SHALL
produce a `StageConfiguration` with no allocation, identical to instantiation before this
requirement existed.

#### Scenario: A profile's declared default reaches the instantiated stage
- **WHEN** a tournament is created from a profile whose second stage declares automatic allocation
- **THEN** the created tournament's second stage configuration records automatic allocation

#### Scenario: An operator override at creation time wins over the profile default
- **WHEN** an operator instantiates a tournament from a profile whose stage declares manual
  allocation, and explicitly declares weighted allocation for that stage during creation
- **THEN** the created stage configuration records the operator's weighted declaration, not the
  profile's manual default

#### Scenario: No profile default and no operator declaration leaves allocation unset
- **WHEN** a tournament is created from a profile whose stage declares no allocation default, and
  the operator does not declare one either
- **THEN** the created stage configuration has no allocation, and seeding behaves as it did before
  allocation defaults existed

### Requirement: An operator can discover a tournament's known entrant-attribute keys
The system SHALL expose the set of entrant-attribute keys already recorded on a tournament's
entrants, so an authoring surface offering weighted allocation can present them as a choice rather
than requiring free-text entry. The set SHALL reflect only attributes actually present on at least
one entrant of that tournament — it SHALL NOT be a platform-wide or cross-tournament catalogue.

#### Scenario: A recorded attribute is discoverable
- **WHEN** entrants have been loaded into a tournament with a `ranking` attribute
- **THEN** `ranking` appears in that tournament's list of known entrant-attribute keys

#### Scenario: An attribute recorded on a different tournament is not offered
- **WHEN** a `seed-power` attribute is recorded only on a different tournament's entrants
- **THEN** `seed-power` does not appear in this tournament's list of known entrant-attribute keys

#### Scenario: No entrants loaded yet yields an empty, not erroring, list
- **WHEN** a tournament has no entrants loaded
- **THEN** the known entrant-attribute keys list is empty, and weighted allocation cannot be
  completed until at least one attribute exists

### Requirement: A next stage can be generated ahead from a reviewed promotion plan

An organizer SHALL be able to generate a next stage's single- or double-elimination structure before
the prior stage completes, from a reviewed promotion plan routing to it. Each first-round side SHALL be
sourced from a qualifier position (its place in the list the plan routes to that zone) and SHALL stay
undecided. The generated matches are schedulable at once.

#### Scenario: Cup quarter-finals exist while groups are still playing

- **WHEN** an organizer generates a cup stage from a reviewed promotion plan while group games remain
  unplayed
- **THEN** the cup's quarter-finals exist with sides naming their qualifier positions and no entrant,
  and can be placed in slots

#### Scenario: Generation ahead needs a reviewed plan

- **WHEN** an organizer generates a next stage ahead of completion without a reviewed promotion plan
  routing to it
- **THEN** the request is refused, naming the missing plan

### Requirement: A qualifier position is labelled by the plan's combination

A qualifier position SHALL carry label parts derived from its plan's combination: under group-then-rank,
a rank and a group; under ranked combination, a cohort rank and an order within that cohort; under
manual combination, the position number. The labels SHALL be computable before any standing exists.

#### Scenario: Group-then-rank names the group

- **WHEN** a plan combines group-then-rank and routes "1st of Group A" to a cup's first position
- **THEN** that position's label parts are rank 1 and Group A

#### Scenario: Ranked combination names the cohort

- **WHEN** a plan ranks same-position cohorts and routes the second-best runner-up to a cup position
- **THEN** that position's label parts are cohort rank 2 and order 2 within the cohort

### Requirement: Next-stage entrants resolve only on explicit confirmation

Resolving qualifier-sourced sides SHALL require an explicit action by an authorized organizer. It SHALL
preview each position's entrant, SHALL be refused while the prior stage is incomplete or a tie at a cut
line is unresolved, and SHALL commit every resolution together, audited, with an outbox event.

#### Scenario: Completing a stage does not fill the next one by itself

- **WHEN** the last group game is finalized
- **THEN** the cup quarter-finals remain undecided until an organizer confirms the qualification

#### Scenario: Confirmation previews before it commits

- **WHEN** an organizer requests the qualification preview for a completed stage
- **THEN** the preview lists each qualifier position with the entrant it resolves to, and nothing changes

#### Scenario: An unresolved tie blocks confirmation

- **WHEN** two entrants are tied at a cut line under the configured tiebreaks
- **THEN** confirmation is refused, naming the tied entrants and the position in dispute

#### Scenario: Confirmation resolves every side at once

- **WHEN** an organizer confirms the qualification of a completed stage
- **THEN** every qualifier-sourced side of the next stage reports its entrant in the same commit, each
  keeps its qualifier source, and unstarted downstream matches keep their slots

#### Scenario: Confirmation needs authority

- **WHEN** a principal without the capability that promotion plan review requires attempts to confirm
- **THEN** the request is refused and nothing changes
