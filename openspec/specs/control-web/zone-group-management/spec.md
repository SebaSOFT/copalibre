# control-web/zone-group-management Specification

## Purpose
Gives tournament operators a control-web surface to create and manage Zones and Groups within a
Stage, assign entrants to them, review group-scoped standings, and configure and review a promotion
plan — the UI half of the Zone/Group domain and API capability, so a multi-zone terminal phase is
reachable without a direct API call.

## Requirements

### Requirement: Zone and Group management screen on a Stage

A stage's control-web view SHALL show its zones and groups, defaulting to the single implicit zone
and implicit group every stage already has when an operator has created no others, and SHALL let an
operator create additional zones and groups, each given a name at creation, before that stage's
fixtures are generated.

#### Scenario: A stage with no explicit zones shows the implicit default
- **WHEN** an operator opens the zone/group screen for a stage that has never had an explicit zone or
  group created
- **THEN** the screen shows exactly one zone and one group, using their implicit default names

#### Scenario: Creating a second zone
- **WHEN** an operator creates a second zone on a stage, naming it "Copa Plata"
- **THEN** the stage now lists two zones, and each is independently selectable for group creation and
  entrant assignment

### Requirement: Entrant assignment to zone and group

The zone/group screen SHALL let an operator assign a stage's entrants to zones and groups, either by
running the same seeded, constraint-satisfying automatic draw already used for bracket seeding and
heat-lobby assignment, or by placing entrants manually — mirroring the automatic/manual choice the
existing seeding builder already offers.

#### Scenario: Automatic draw honors declared constraints
- **WHEN** an operator runs an automatic draw for group assignment with a separation constraint (e.g.
  "no two entrants from the same club in one group")
- **THEN** the resulting assignment satisfies the declared constraint for every group, the same
  guarantee the existing heat-lobby draw already provides

#### Scenario: Manual placement is available as an alternative
- **WHEN** an operator chooses manual placement instead of an automatic draw
- **THEN** the operator can assign each entrant to a specific zone and group directly, and the
  assignment is recorded exactly as an automatic draw's result would be

### Requirement: Group-scoped standings and bracket view

For a stage with more than one group, the control-web standings and bracket views SHALL let an
operator select a specific group and see that group's own standings or bracket, scoped to that
group's matches only.

#### Scenario: Selecting a group filters standings to that group
- **WHEN** an operator selects "Zona Norte, Grupo B" on a stage with several zones and groups
- **THEN** the standings table shown reflects only that group's matches and entrants

### Requirement: Promotion plan configuration and review

A zone's control-web view SHALL let an operator configure a promotion plan — how many entrants
advance from each of the zone's groups, and how the resulting per-group cuts combine into one ordered
list (by a declared comparator pipeline, by explicit manual placement, or by simple group-then-rank
order) — and, when the next stage declares more than one zone, which contiguous band of the combined
list routes to which of that stage's zones. The screen SHALL display the computed, ordered candidate
list for the operator to review before it is used; computing or displaying this list SHALL NOT, by
itself, create or modify the next stage's seeding.

#### Scenario: Reviewing a computed promotion list before acting
- **WHEN** an operator opens the promotion plan screen for a zone whose groups have completed
  round-robin play
- **THEN** the screen shows the ordered list of candidates the plan would promote, without having
  created or changed any seeding for the next stage

#### Scenario: An unresolved group cut is surfaced, not hidden
- **WHEN** one group in the zone has an unresolved tie at its own cut line
- **THEN** the promotion screen shows this group's cut as unresolved and does not present a completed
  combined list until an operator resolves it
