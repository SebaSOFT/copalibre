## ADDED Requirements

### Requirement: Group promotion combines several groups' cuts into one ordered list

When a zone's stage is split into groups, a promotion plan SHALL declare how many entrants advance
from each group — a single count applying to every group, or a distinct count per group — and how
entrants promoted from different groups combine into one ordered list for the next stage's seeding.
The combination SHALL be one of: a declared comparator pipeline ranking same-finishing-position
cohorts against each other, explicit operator placement, or simple group-then-rank order. A group's
own cut SHALL resolve (see the existing "tie at the cut line is never silently broken" requirement)
before its entrants are eligible for cross-group combination.

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
- **WHEN** a promotion plan's bands route entrants into a terminal phase's zones (a phase with no
  phase after it)
- **THEN** nothing about declaring or resolving bands requires, implies, or schedules any further phase
  — bands route to zones of *the next stage*, which may or may not itself be the tournament's last

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
  no next-stage fixture, and starts no seeding — exactly as previewing a single-pool qualification cut
  already does not commit anything

#### Scenario: Generating the next stage remains a separate, explicit act
- **WHEN** a promotion plan's combined list is fully resolved
- **THEN** the next stage's fixtures are still not generated until an officer explicitly requests it,
  the same gate a single-pool qualification cut is already held to
