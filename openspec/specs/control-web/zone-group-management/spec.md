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

A zone's control-web view SHALL let an operator configure a promotion plan: how many entrants
advance from each of the zone's groups, how the per-group cuts combine into one ordered list, and,
when the next stage declares more than one zone, which contiguous band of that list routes to which
zone. The screen SHALL display the computed, ordered candidate list for review before it is used;
computing or displaying it SHALL NOT, by itself, create or modify the next stage's seeding.

#### Scenario: Reviewing a computed promotion list before acting
- **WHEN** an operator opens the promotion plan screen for a zone whose groups have completed
  round-robin play
- **THEN** the screen shows the ordered list of candidates the plan would promote, without having
  created or changed any seeding for the next stage

#### Scenario: An unresolved group cut is surfaced, not hidden
- **WHEN** one group in the zone has an unresolved tie at its own cut line
- **THEN** the promotion screen shows this group's cut as unresolved and does not present a completed
  combined list until an operator resolves it

#### Scenario: The combination is one of three

- **WHEN** an operator chooses how cuts combine
- **THEN** the choices are a declared comparator pipeline, explicit manual placement, or simple
  group-then-rank order

### Requirement: Seeding builder pre-fill from a reviewed promotion plan

When the seeding builder opens for a stage with no seeds drawn or placed yet, and a prior stage's
zone has a stored promotion plan targeting it, the initial seed order SHALL be pre-filled from the
promotion-preview results. The pre-fill SHALL NOT persist anything, and SHALL NOT override a stage
that already has seeds.

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

#### Scenario: Several targeting zones combine per band

- **WHEN** more than one zone of a prior stage targets the stage
- **THEN** their promotion-preview results are combined per band into the pre-filled order

#### Scenario: Publishing stays explicit

- **WHEN** the seed order has been pre-filled
- **THEN** nothing takes effect until the operator publishes through the seeding builder's existing
  workflow

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

### Requirement: Assigned entrant roster visibility within groups
When viewing groups in a zone, the screen SHALL render the list of entrants currently assigned to each group.

#### Scenario: Viewing a group with assigned entrants
- **WHEN** an operator views a zone whose groups have entrants assigned via draw or manual placement
- **THEN** each group card displays the human-readable names of its assigned entrants

#### Scenario: Viewing a group with no entrants assigned
- **WHEN** an operator views a group into which no entrants have yet been placed
- **THEN** the group displays an explicit empty state indicating no entrants are assigned

### Requirement: Promotion plan preview localization and candidate presentation
When reviewing a computed promotion plan, the candidate list SHALL render human-readable participant names rather than truncated identifiers. An unconfigured promotion plan SHALL render with an informative message in the active locale rather than a raw server error.

#### Scenario: Unconfigured promotion plan renders localized informational state
- **WHEN** an operator views the promotion plan screen for a zone without a saved promotion plan
- **THEN** the candidate review card renders an informational message in the active locale (e.g. "No hay un plan de promoción guardado para esta zona todavía") rather than an English API error string or a destructive alert

#### Scenario: Candidate list renders resolved participant names
- **WHEN** an operator views the computed promotion plan review list
- **THEN** each candidate entry renders the participant's full display name rather than a raw hex identifier slice

### Requirement: Operator Authoring of Inheritable Zone Formats
The control panel's zone management SHALL let an operator override a zone's format and series. It SHALL show the inherited stage default and an explicit control to override it, constrained to the formats the installed discipline supports. An overridden zone SHALL be labeled as such and a zone without an override SHALL indicate inheritance. Overrides SHALL be unavailable once the stage holds a fixture.

#### Scenario: Operator overrides format for a specific zone
- **WHEN** an operator opens the settings of Zone 3 in a `single-elimination` stage and chooses `round-robin`
- **THEN** Zone 3 persists `round-robin` as its format
- **AND** Zone 3 is labeled as overridden while Zones 1 and 2 indicate inheritance

#### Scenario: Operator reverts a zone to the stage default
- **WHEN** an operator clears a zone's format override
- **THEN** the zone's stored format is null and it inherits the stage's format

#### Scenario: Overrides locked after fixtures exist
- **WHEN** the stage already holds fixtures
- **THEN** the zone override controls are disabled and say why

### Requirement: The seeding builder can generate a next stage ahead

When a reviewed promotion plan routes to a stage whose prior stage is incomplete, the seeding builder
SHALL offer to generate the stage ahead with qualifier positions instead of entrants. It SHALL show
each position's label before publishing, and SHALL state that entrants will be confirmed once the prior
stage completes.

#### Scenario: Generating cups ahead from the builder

- **WHEN** an organizer opens a cup stage's seeding builder while its groups are still playing, and a
  reviewed promotion plan routes to it
- **THEN** the builder offers to generate ahead, previews the bracket with qualifier labels, and
  publishes only on an explicit action

### Requirement: Qualification is confirmed from the control panel

The control panel SHALL offer a qualification confirmation for a stage generated ahead. It SHALL show
the preview of each qualifier position's entrant, any unresolved cut-line tie with the entrants
involved, and SHALL commit only on an explicit confirmation.

#### Scenario: Confirming the cups after the groups

- **WHEN** an organizer opens the confirmation for the cup stage after the last group game is finalized
- **THEN** the screen lists each cup position with its resolved entrant and a confirm action, and the
  cups show their entrants once it is confirmed

#### Scenario: A tie is shown instead of a confirm action

- **WHEN** a cut-line tie is unresolved
- **THEN** the screen names the tied entrants and the position, and offers no confirm action

### Requirement: Draw mode has no preselection

The zone assignment step SHALL present "Automatic draw" and "Manual placement" with neither selected,
and SHALL not run or preview a draw until one is chosen.

#### Scenario: First visit

- **WHEN** an organizer opens zone assignment for the first time
- **THEN** neither mode is selected, and Preview draw is unavailable until one is
