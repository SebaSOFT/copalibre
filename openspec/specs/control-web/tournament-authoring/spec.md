# tournament-authoring Specification

## Purpose
Lets organizers create and publish a tournament through a guided wizard that only ever exposes the
supported MVP disciplines and formats, and correctly classifies later edits by mutation impact.

## Requirements

### Requirement: Wizard restricts format selection to MVP formats
The tournament setup wizard SHALL offer only single elimination, double elimination, round robin,
league, round robin single-leg, and round robin home-and-away as selectable formats, and SHALL NOT
advertise or accept any other format.

#### Scenario: Unsupported format is not selectable
- **WHEN** an organizer reaches the Format step of the wizard
- **THEN** the presented format options are exactly the six MVP formats and no others

### Requirement: Format options are constrained by the selected discipline
The Format step SHALL only present formats the selected `DisciplineDescriptor` declares as supported.

#### Scenario: Discipline without a supported format is filtered out
- **WHEN** the selected discipline's descriptor does not declare support for double elimination
- **THEN** double elimination does not appear as a selectable format for that tournament

### Requirement: Tournament creation produces a versioned ruleset
Completing the wizard SHALL create a `TournamentRuleset` referencing a specific versioned
`DisciplineDescriptor`, recording which descriptor version was in effect at creation time.

#### Scenario: Created tournament records its descriptor version
- **WHEN** an organizer completes the wizard against discipline descriptor version 3
- **THEN** the resulting tournament's ruleset records descriptor version 3 as its basis

### Requirement: Edits to a published tournament are mutation-classified
Editing a published tournament's configuration SHALL classify the edit as `safe`,
`requires_rebuild`, or `blocked_after_results`, and SHALL block the edit outright if its
classification is `blocked_after_results` and a valid result already exists. This classification
applies to every configurable field including `region`, `capacity`, and `checkInClosesAt`, not only the
fields the wizard already classified before this change.

#### Scenario: Blocked edit after a result exists
- **WHEN** an organizer attempts an edit classified `blocked_after_results` on a tournament that already has a recorded match result
- **THEN** the wizard/edit UI rejects the edit and states that an authorized correction workflow is required instead

#### Scenario: Safe edit applies without warning
- **WHEN** an organizer edits a field classified `safe`
- **THEN** the change applies without a rebuild warning or blocking dialog

#### Scenario: Capacity reduction below current registrations is a blocked edit
- **WHEN** an organizer attempts to reduce `capacity` below the tournament's current accepted-entrant
  count on a published tournament
- **THEN** the edit is rejected as incoherent with the existing record, stating the current entrant
  count, rather than silently accepted

### Requirement: Public-registration and check-in toggles are explicit tournament settings
The wizard SHALL let the organizer explicitly set whether public registration is open and whether
check-in is required, and SHALL record both as part of the tournament's configuration.

#### Scenario: Check-in requirement is persisted
- **WHEN** an organizer enables "Requires Check-in" during setup
- **THEN** the created tournament's configuration records check-in as required

### Requirement: Wizard captures every field it validates
Any field the wizard validates or lets the organizer set SHALL be included in the tournament-creation
request; the wizard SHALL NOT collect a value, validate it, and then discard it before submission. A
field the wizard presents SHALL also be explained, so that no organizer is asked to supply a value the
surface never told them the meaning of.

#### Scenario: Capacity set in the wizard reaches the created tournament
- **WHEN** an organizer sets a participant capacity during the window step and completes the wizard
- **THEN** the created tournament's configuration records that capacity

#### Scenario: Region set in the wizard reaches the created tournament
- **WHEN** an organizer sets a region during the window step and completes the wizard
- **THEN** the created tournament's configuration records that region

#### Scenario: Every presented decision carries an explanation
- **WHEN** the wizard renders any step
- **THEN** every decision on that step either shows a description or comes from a declaration that
  carries none, and no decision is left unexplained because the surface forgot to ask for one

### Requirement: Wizard offers every field the API already accepts
A field already accepted by the tournament-creation endpoint SHALL be reachable from the wizard; the
wizard SHALL NOT omit a step for a field the API is already prepared to receive. A field the domain
validates and the engine reads SHALL NOT be left unreachable from both the wizard and the endpoint:
a declared, validated, engine-honoured setting that no surface can set is a setting the product does
not have.

#### Scenario: Check-in closing time is configurable in the wizard
- **WHEN** an organizer enables "Requires Check-in" during setup
- **THEN** the wizard offers a field to set when checked-in team memberships stop being editable, and a
  value set there reaches the created tournament's configuration

#### Scenario: A validated engine setting is reachable from the product
- **WHEN** the domain validates a configuration field and the engine changes its behavior according to
  it
- **THEN** that field is accepted by the endpoint and offered by the wizard, so no organizer has to
  write a ruleset by hand to reach behavior the engine already implements

### Requirement: Wizard offers explicit tournament-profile selection
When the selected discipline and format combination has one or more compatible `TournamentProfile`
entries in the installed catalogue, the wizard SHALL let the organizer select one explicitly (or
proceed without one), and a selected profile's declared stages SHALL be pre-created on the resulting
tournament.

#### Scenario: A multi-stage profile is offered and instantiated
- **WHEN** an organizer selects a discipline and format for which an installed `TournamentProfile`
  declares more than one stage
- **THEN** the wizard offers that profile as a selectable option, and completing the wizard with it
  selected creates a tournament with all of that profile's declared stages already present

#### Scenario: No compatible profile still allows tournament creation
- **WHEN** no installed `TournamentProfile` is compatible with the selected discipline and format
- **THEN** the wizard proceeds without offering a profile selection, producing a single-stage tournament
  as it does today

### Requirement: The wizard offers a per-event rule-authoring step
The tournament setup wizard SHALL offer a step where an organizer may define zero or more custom
rules — each an ordered list of conditions and one or more actions — attached to a published hook
point supported by tournament custom scripts, using only hooks and vocabulary the registry-introspection
contract lists.

#### Scenario: An organizer composes a rule from listed vocabulary
- **WHEN** an organizer builds a rule in the wizard's rule-authoring step
- **THEN** every hook, condition, action, named parameter, parameter type, value control, and expression
  mode offered comes from the registry-introspection contract's declarative definitions
- **AND** frontend contains no independent list of executable vocabulary

#### Scenario: Parameter controls follow backend schemas
- **WHEN** an organizer selects a condition or action
- **THEN** wizard renders its required and optional named parameters from their JSON Schemas
- **AND** values that fail those schemas cannot be submitted

#### Scenario: A rule with no conditions is explained before saving
- **WHEN** an organizer saves a rule that declares no conditions
- **THEN** the wizard states that the rule's actions will fire every time the hook is reached,
  consistent with `rules-engine`'s degenerate-script semantics, rather than saving silently

#### Scenario: Skipping the step is valid
- **WHEN** an organizer completes the wizard without defining any custom rule
- **THEN** the tournament is created normally with no custom scripts attached

### Requirement: An invalid rule is refused with the offending reference named
The wizard SHALL surface the same reference-vetting refusal the backend produces when a composed rule
references an unregistered element or a disallowed expression, naming the offending element rather
than a generic failure.

#### Scenario: An unregistered reference is named in the UI
- **WHEN** a composed rule fails backend vetting because of a stale or unregistered element type
- **THEN** the wizard displays which element was rejected and why, using the backend's own refusal
  message rather than a generic error

### Requirement: A stage declares whether its crosses are settled by a series
The tournament authoring surface SHALL let an operator declare, per stage, whether each cross is
settled by a single match or by a series, and when by a series, how many matches it spans, which
resolution class decides it, whether it is played on neutral ground, and whether it counts towards
standings as one result per series or one result per played match. Declaring no series SHALL
remain the default and SHALL require no operator action.

The accounting grain SHALL be offered as an explicit control naming what each choice does to the
standings table, not by its label alone. It SHALL preselect one result per played match, which is what
an undeclared grain has always meant, so that an operator with no view is never blocked and an operator
with one can see what they are getting. An operator declaring no series SHALL see no such control.

#### Scenario: An operator declares a best-of-five play-off stage
- **WHEN** an operator authoring a single-elimination stage declares a five-match series resolved by
  majority
- **THEN** the stage is stored with that declaration, and generating it produces five matches per cross

#### Scenario: An operator declares a two-legged tie
- **WHEN** an operator declares a two-match series resolved on aggregate
- **THEN** the stage is stored with that declaration, and the authoring surface states that sides
  reverse between the two matches

#### Scenario: Declaring nothing leaves the stage as it is today
- **WHEN** an operator authors a stage without touching the series controls
- **THEN** the stage settles every cross by a single match, and the authored configuration is identical
  to what the same inputs produced before series existed

#### Scenario: The accounting grain is offered with the rest of the declaration
- **WHEN** an operator turns on a multi-match series during setup
- **THEN** the surface offers a control choosing between one result per series and one result per
  played match, preselecting one result per played match, with each option describing its effect on the
  standings table

#### Scenario: The chosen grain reaches the stored declaration
- **WHEN** an operator declares a best-of-five counting as one result per series and completes
  authoring
- **THEN** the stored declaration records series-grain accounting, and reopening the stage shows that
  choice

#### Scenario: A stage with no series offers no grain
- **WHEN** an operator authors a stage without declaring a series
- **THEN** no accounting-grain control is shown, and the authored configuration is byte-identical to
  one produced before the control existed

### Requirement: A series declaration is refused where it cannot hold
The authoring surface SHALL refuse a series declaration that the engine cannot generate, naming the
reason, before the stage is stored. This is a refusal for a configuration that would be incoherent, not
a judgement about what a sport usually does.

#### Scenario: A series on a placement stage is refused
- **WHEN** an operator attempts to declare a series on a stage whose format is heats or free-for-all
- **THEN** the declaration is refused, naming that a series settles a cross between two sides and a
  placement match has none

#### Scenario: An even-length best-of series is refused
- **WHEN** an operator declares a `best-of` series spanning an even number of matches
- **THEN** the declaration is refused, naming that no majority exists, and the operator is pointed at
  the aggregate and points-per-leg classes, which an even count does suit

### Requirement: Changing a stage's series declaration is mutation-classified
An edit to a published tournament's series declaration SHALL be classified and reported to the operator
before it is applied, on the same contract every other authoring edit already follows.

#### Scenario: The operator is told what a rebuild would change
- **WHEN** an operator lengthens a series on a published, unstarted stage
- **THEN** the surface reports the change as requiring a rebuild and names how many matches would be
  generated, before the edit is committed

#### Scenario: A blocked series edit names the correction workflow
- **WHEN** an operator attempts to shorten a series after a match of it has been finalized
- **THEN** the edit is refused as blocked after results, directing the operator to the audited
  correction workflow

### Requirement: Every authored decision explains what it does during the competition
Each decision an authoring surface presents — a format, a resolution class, a tiebreak comparator, a
check-in policy, a series accounting grain, a scoring option — SHALL carry a description explaining what
that choice causes to happen while the competition is running, not what it is called.

The description SHALL be attached to the field's own declaration rather than to the control that renders
it, so that every surface rendering the same field shows the same explanation and a second surface
cannot drift from the first.

Where a field is a closed set of options, each option SHALL carry its own description. Where a field's
mutation policy declares that changing it becomes `requires_rebuild` or `blocked_after_results`, the
description SHALL say so at authoring time, so an organizer learns a choice is hard to reverse before
they make it rather than when they are refused.

A field that declares no description SHALL render exactly as it does today.

#### Scenario: A closed-set decision explains each of its options
- **WHEN** an organizer opens a step offering a series resolution class
- **THEN** each of `best-of`, `aggregate` and `points-per-leg` is shown with a description of how it
  decides the tie, in terms of what happens across the matches rather than in the platform's vocabulary

#### Scenario: A description names execution-time consequence
- **WHEN** an organizer reads the description of a decision that changes how standings are counted
- **THEN** the description states what the standings will do, not what the setting is named

#### Scenario: A hard-to-reverse decision says so before it is made
- **WHEN** an organizer opens a decision whose field policy blocks changing it once a result exists
- **THEN** the description states that the choice cannot be changed after the first result, and names
  the audited correction workflow as the remedy

#### Scenario: The explanation is reachable without a pointer
- **WHEN** an organizer navigates the wizard by keyboard, or on a touch device
- **THEN** every decision's description is reachable and readable without hovering, and is present in
  the accessible name or description of the control it explains

#### Scenario: A field with no declared description is unchanged
- **WHEN** a step renders a field whose declaration carries no description
- **THEN** the control renders exactly as it did before descriptions existed

### Requirement: A discipline's own decisions are explained in the discipline's words
Where a decision comes from an installed discipline module rather than from the platform, the
description shown SHALL be the module's own declared text in the reader's language, not text the
platform composed on the module's behalf.

#### Scenario: A module-declared option carries the module's explanation
- **WHEN** an organizer authors a tournament in a discipline whose descriptor declares its own formats
  or scoring options with descriptions
- **THEN** the wizard shows those descriptions verbatim from the descriptor

#### Scenario: A module that declares no description degrades quietly
- **WHEN** an installed discipline declares an option without a description
- **THEN** the option is offered with its label alone and no placeholder or apology is rendered

### Requirement: An unseeded stage can be renamed, reformatted or removed
A stage that has no generated fixtures SHALL be renamable, and SHALL be able to have its format changed
or be removed entirely, before it holds any fixture. Once a stage holds a fixture, an attempt to change
its format or remove it SHALL be refused, naming that fixtures already exist and directing the operator
to the seeding workflow that governs fixtures instead.

Renaming an unseeded or a seeded stage SHALL be permitted in either case, since a name carries no
structural consequence.

#### Scenario: An unseeded stage's format is corrected
- **WHEN** an operator changes the format of a stage that has never been seeded
- **THEN** the stage's format is updated, with no fixture to invalidate

#### Scenario: An unseeded stage is removed
- **WHEN** an operator removes a stage that has never been seeded
- **THEN** the stage no longer exists and no fixture, zone or group belonging to it survives it

#### Scenario: A seeded stage's format change is refused
- **WHEN** an operator attempts to change the format of a stage that already holds generated fixtures
- **THEN** the change is refused, naming that fixtures already exist

#### Scenario: A seeded stage cannot be removed
- **WHEN** an operator attempts to remove a stage that already holds generated fixtures
- **THEN** the removal is refused, naming that fixtures already exist

#### Scenario: Renaming carries no structural refusal
- **WHEN** an operator renames a stage, seeded or not
- **THEN** the rename applies, because a name change invalidates nothing a fixture depends on

### Requirement: A published tournament's ruleset overrides are editable and mutation-classified
A tournament's `TournamentRuleset` overrides — every field the installed `DisciplineDescriptor` marks
`replaced` or `merged`, excluding custom scripts which keep their existing dedicated edit path — SHALL
be editable after publication. Each changed field SHALL be classified `safe`, `requires_rebuild`, or
`blocked_after_results` before the edit is applied, on the same mutation-classification contract every
other configuration edit already follows. An edit touching a `blocked_after_results` field SHALL be
refused once the tournament has a recorded match result, directing the operator to the audited
correction workflow instead. An edit SHALL never discard an override the request did not name.

#### Scenario: A safe ruleset override applies without warning
- **WHEN** an organizer edits a ruleset override field classified `safe`
- **THEN** the edit applies immediately with no rebuild warning

#### Scenario: A requires_rebuild override reports what it invalidates
- **WHEN** an organizer edits a ruleset override field classified `requires_rebuild` on a tournament with generated fixtures
- **THEN** the edit applies and the response names the fixtures the change invalidates

#### Scenario: A blocked ruleset override is refused after results
- **WHEN** an organizer attempts to edit a ruleset override field classified `blocked_after_results` on a tournament that already has a recorded match result
- **THEN** the edit is refused, directing the operator to the audited correction workflow

#### Scenario: Editing one field leaves every other override untouched
- **WHEN** an organizer edits a single ruleset override field
- **THEN** every other field already present in the ruleset's overrides is unchanged in the resulting version

### Requirement: An unseeded stage's configuration overrides are editable and mutation-classified
A `StageConfiguration`'s overrides SHALL be editable for as long as the stage holds no generated
fixture, classified `safe`, `requires_rebuild`, or `blocked_after_results` on the same contract the
tournament's ruleset overrides use. Once the stage holds a fixture, an edit attempt SHALL be refused,
naming that fixtures already exist and directing the operator to the seeding workflow that governs
fixtures instead.

#### Scenario: An unseeded stage's configuration override is corrected
- **WHEN** an operator edits a configuration override on a stage that has never been seeded
- **THEN** the override is updated, with no fixture to invalidate

#### Scenario: A seeded stage's configuration edit is refused
- **WHEN** an operator attempts to edit a configuration override on a stage that already holds generated fixtures
- **THEN** the edit is refused, naming that fixtures already exist

### Requirement: A ruleset or stage-configuration edit is previewable before commit
An operator SHALL be able to preview a ruleset-override or stage-configuration edit's classification
and, where applicable, its invalidated fixtures, without applying the edit — on the same request/response
shape the tournament's series-declaration preview already uses.

#### Scenario: A preview reports classification without applying anything
- **WHEN** an operator submits a ruleset-override or stage-configuration edit to the preview endpoint
- **THEN** the response reports the resulting mutation classification and no stored ruleset or stage configuration changes
