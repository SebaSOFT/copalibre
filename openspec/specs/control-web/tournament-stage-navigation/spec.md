# control-web/tournament-stage-navigation Specification

## Purpose
Fills the two reserved-but-unimplemented control-web URL levels — a tournament's bare hub and a
stage's bare hub — with real screens, giving an operator an actual drill-down path from a
tournament to any of its stages and from a stage to its identity and its existing seeding,
zones/groups, standings and schedule tools, instead of requiring a suffixed URL nobody's UI
produces.

## Requirements

### Requirement: Tournament hub lists its stages

The control-web route `/control/{organizationAlias}/tournaments/{tournamentAlias}` (no further
segments) SHALL render a screen listing that tournament's stages, each showing its number, name,
format, and whether it has been seeded, with each stage linking to that stage's hub.

#### Scenario: A tournament with stages shows its stage list
- **WHEN** an operator opens a tournament's hub
- **THEN** every stage the tournament declares is listed with its number, name, format, and seeded
  state

#### Scenario: A listed stage opens its own hub
- **WHEN** an operator activates a listed stage
- **THEN** the control panel navigates to that stage's hub

### Requirement: Stage hub shows the stage's identity

The control-web route
`/control/{organizationAlias}/tournaments/{tournamentAlias}/stages/{stageNumber}` (no further
segments) SHALL render a screen showing that stage's number, current name, and current format.

#### Scenario: Opening a stage's hub shows its current name
- **WHEN** an operator opens a stage's hub
- **THEN** the screen shows that stage's current name, not a blank field, since the hub reads the
  stage back rather than only accepting a new value

### Requirement: A single stage can be read back by number

A stage's number, name, and format SHALL be retrievable by organization alias, tournament alias,
and stage number, independent of any other stage-scoped read (seeding, standings, zones), so a
screen needing only a stage's identity does not depend on fetching an unrelated stage-scoped
resource first.

#### Scenario: A stage's identity is read without a seeding fetch
- **WHEN** the stage hub loads a stage that has no seeding data yet (no fixtures, no zones)
- **THEN** the stage's number, name, and format are still returned

### Requirement: Stage hub owns rename, format-change, and removal

The stage hub SHALL let an operator rename the stage regardless of whether it holds a fixture, and
change its format or remove it only while it holds no fixture, reusing the existing rename/format-
change/removal behavior (`control-web/tournament-authoring`'s "An unseeded stage can be renamed,
reformatted or removed") without altering it. The format-change control SHALL offer the tournament's
discipline-declared formats to choose from, naming the currently-selected format, rather than
requiring the operator to type a format string from memory.

#### Scenario: A published stage's name is corrected from its hub
- **WHEN** an operator renames a stage that already holds generated fixtures, from that stage's hub
- **THEN** the rename applies and the stage's fixtures, zones, and groups are unchanged

#### Scenario: A seeded stage's format-change attempt surfaces the refusal reason
- **WHEN** an operator attempts a format change on a stage that already holds fixtures, from that
  stage's hub
- **THEN** the hub shows the reason the API returns, naming that fixtures already exist, unchanged
  from what the API sent

#### Scenario: An unseeded stage's format choices come from its own discipline
- **WHEN** an operator opens an unseeded stage's hub
- **THEN** the format control offers exactly the formats that tournament's discipline descriptor
  declares, with the stage's current format shown as the selected one

#### Scenario: Choosing a format shows what it means
- **WHEN** an operator selects a different format in the stage hub's format control
- **THEN** the hub shows that format's own description before the operator confirms the change

### Requirement: Stage hub links to that stage's other control-web tools

The stage hub SHALL offer links to that stage's seeding, zones-and-groups, standings, and schedule
screens.

#### Scenario: Reaching seeding from the stage hub
- **WHEN** an operator is on a stage's hub
- **THEN** a link to that same stage's seeding screen is present and reachable

### Requirement: A stage's other control-web tools link back to its hub

Each of a stage's seeding, zones-and-groups, standings, and schedule screens SHALL offer a link
back to that stage's hub, so an operator who reaches one of those tools without visiting the hub
first can still rename or remove the stage.

#### Scenario: Reaching the stage hub from zones and groups
- **WHEN** an operator is on a stage's zones-and-groups screen, having navigated there without
  first visiting the stage hub
- **THEN** a link to that stage's hub is present and reachable
