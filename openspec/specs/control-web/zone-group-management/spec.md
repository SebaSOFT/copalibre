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

### Requirement: Seeding builder pre-fill from a reviewed promotion plan

When an operator opens the seeding builder for a stage that has no seeds drawn or manually placed yet,
and one or more zones of a prior stage have a stored promotion plan targeting this stage, the seeding
builder's initial seed order SHALL be pre-filled from those zones' promotion-preview results (combined
per band, when more than one zone targets this stage). This pre-fill SHALL NOT itself persist anything;
the operator still explicitly publishes through the seeding builder's existing workflow before any
seed order takes effect. A stage that already has seeds SHALL NOT have them overridden by this pre-fill.

#### Scenario: A reviewed promotion plan pre-fills the next stage's seeding
- **WHEN** an operator, having reviewed a zone's promotion plan, opens the next stage's seeding builder
  for the first time (no draw or manual placement has run there yet)
- **THEN** the seeding builder is pre-filled from the reviewed promotion plan's ordered list, and the
  operator still explicitly publishes that seeding through the existing seeding-builder workflow
  before it takes effect

#### Scenario: An existing seed order is not overridden
- **WHEN** an operator opens the seeding builder for a stage that already has a draw or manual
  placement recorded, and a promotion plan also targets that stage
- **THEN** the seeding builder shows the already-recorded seed order, unaffected by the promotion plan

### Requirement: A zone or group can be renamed or removed before an entrant is assigned into it
An operator SHALL be able to rename a zone or group at any time, and SHALL be able to remove one
provided no entrant has been assigned into it. Once an entrant has been assigned, removal SHALL be
refused, naming that entrants are assigned and directing the operator to reassign them first rather than
losing the assignment silently.

#### Scenario: A wrongly-named zone is corrected
- **WHEN** an operator renames a zone created with the wrong name
- **THEN** the zone's name is updated and every entrant already assigned into it remains assigned

#### Scenario: An empty zone is removed
- **WHEN** an operator removes a zone into which no entrant has been assigned
- **THEN** the zone no longer exists

#### Scenario: A zone with assigned entrants cannot be removed
- **WHEN** an operator attempts to remove a zone that already has an entrant assigned into it
- **THEN** the removal is refused, naming that entrants are assigned, rather than the assignment being
  silently discarded

#### Scenario: The same rule applies to a group
- **WHEN** an operator attempts to remove a group that already has an entrant assigned into it
- **THEN** the removal is refused on the same terms a zone's removal would be
