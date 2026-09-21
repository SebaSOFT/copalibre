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
tournament. Selecting a profile SHALL show the operator a read-only preview of that profile's
declared stages, each stage's format, and each stage's declared default allocation, before the
tournament is created. The preview SHALL NOT be editable from the wizard; an operator wanting a
different stage list or allocation for this one tournament proceeds without selecting a profile, or
edits the tournament's stages after creation through the existing stage-management surface.

#### Scenario: A multi-stage profile is offered and instantiated
- **WHEN** an organizer selects a discipline and format for which an installed `TournamentProfile`
  declares more than one stage
- **THEN** the wizard offers that profile as a selectable option, and completing the wizard with it
  selected creates a tournament with all of that profile's declared stages already present

#### Scenario: No compatible profile still allows tournament creation
- **WHEN** no installed `TournamentProfile` is compatible with the selected discipline and format
- **THEN** the wizard proceeds without offering a profile selection, producing a single-stage tournament
  as it does today

#### Scenario: Selecting a profile previews its stages and seeding read-only
- **WHEN** an organizer selects an installed profile declaring three stages, each with its own
  allocation default
- **THEN** the wizard shows all three stages, their formats, and their declared allocation defaults,
  with no control to edit any of them from this screen

#### Scenario: An operator who wants a different structure proceeds without a profile
- **WHEN** an organizer wants a stage structure that differs from every installed profile
- **THEN** the organizer proceeds without selecting a profile and authors the stage list directly,
  rather than being offered an in-place edit of a profile's preview

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

### Requirement: Featured toggle is an explicit tournament setting
Tournament settings SHALL expose an explicit Featured toggle, editable by an organization admin,
alongside the existing public-registration and check-in toggles. Setting it SHALL be classified a
`safe` mutation.

#### Scenario: An organization admin flags a tournament featured
- **WHEN** an organization admin enables the Featured toggle for a published tournament
- **THEN** the tournament's `featured` value updates to `true` and the mutation is classified `safe`

#### Scenario: A non-admin cannot set the Featured toggle
- **WHEN** a user without the organization-admin role attempts to change the Featured toggle
- **THEN** the request is rejected and the tournament's `featured` value is unchanged

### Requirement: Wizard authors every stage of a tournament in one pass
The tournament setup wizard SHALL let an operator declare the tournament's full stage list —
add, remove, or append a stage — rather than a single implicit stage, before creating the
tournament. Each stage SHALL carry its own format, chosen from the formats the selected
discipline supports. The list SHALL have no maximum stage count and a minimum of one stage.
Stages SHALL NOT be reorderable in this pass; an operator wanting a different order removes and
re-adds stages. Each stage's position SHALL be renumbered to a contiguous 1-based sequence after
any add or remove, with no gap and no duplicate.

#### Scenario: An operator declares a three-stage tournament
- **WHEN** an operator adds a round-robin stage, then a single-elimination stage, then a second
  single-elimination stage, and completes the wizard
- **THEN** the created tournament has all three stages pre-created in that order, each with its
  declared format

#### Scenario: Removing a middle stage renumbers the remainder
- **WHEN** an operator has declared three stages and removes the second
- **THEN** the remaining two stages are numbered 1 and 2, with no gap

#### Scenario: A single-stage tournament is unaffected
- **WHEN** an operator declares exactly one stage and completes the wizard
- **THEN** the created tournament has one stage, identical to what a tournament created before
  this capability existed would have

### Requirement: Each authored stage declares its own seeding/allocation mode
Each stage declared in the wizard SHALL let the operator choose how that stage's entrants and
seed order will be filled: automatic (the prior stage's qualification cut), manual (the operator
places entrants), or weighted (a numeric entrant attribute, with a direction stating whether
higher or lower values seed first). Weighted mode's attribute SHALL be chosen from a list of the
tournament's known entrant-attribute keys, not free text. A stage's allocation mode SHALL NOT be
validated against its own or a prior stage's format in the wizard; an incompatible combination is
refused at submission by the same validation the domain already applies to allocation.

#### Scenario: An operator declares automatic allocation for a knockout stage following a group stage
- **WHEN** an operator declares a knockout stage's allocation as automatic
- **THEN** the created stage's configuration records automatic allocation, and once the prior
  stage completes its entrants and seed order come from that stage's qualification cut

#### Scenario: An operator declares weighted allocation by a known attribute
- **WHEN** an operator declares a stage's allocation as weighted by an attribute already recorded
  on this tournament's entrants, with direction "higher-first"
- **THEN** the created stage's configuration records weighted allocation on that attribute and
  direction

#### Scenario: A stage left undeclared defaults to manual
- **WHEN** an operator completes the wizard without choosing an allocation mode for a stage
- **THEN** the stage's configuration declares no allocation, which the seeding surface treats as
  it does today — the operator supplies the order

#### Scenario: An incompatible allocation is refused at submission, not mid-authoring
- **WHEN** an operator submits the wizard with an allocation the domain refuses for that stage's
  configuration
- **THEN** the refusal is reported at submission with the domain's own reason, and the wizard does
  not pre-filter allocation choices while the operator is still authoring

### Requirement: A ruleset override field renders a typed control, never raw JSON
The ruleset-override editor SHALL render one typed control per configured field, chosen from the
field's `FieldPolicy` and the runtime type of its value in the discipline's defaults, instead of a
text input the operator fills with hand-typed JSON. A `boolean`-valued field SHALL render a checkbox;
a `number`-valued field SHALL render a number input; a `string`-valued field SHALL render a text
input, except `format`, which SHALL render a selection constrained to the installed discipline's
declared `availableFormats`. A field whose override permission is `inherited` or `forbidden` SHALL
NOT be offered a control at all.

#### Scenario: A boolean field renders a checkbox
- **WHEN** the editor renders a configured field whose current value is a boolean
- **THEN** it shows a checkbox, not a text field expecting `true`/`false` as typed JSON

#### Scenario: The format field only offers the discipline's declared formats
- **WHEN** the editor renders the `format` field
- **THEN** it offers a selection whose options are exactly the installed discipline's
  `availableFormats`, and no other value can be entered

#### Scenario: A forbidden or inherited field offers no control
- **WHEN** the editor encounters a field whose override permission is `forbidden` or `inherited`
- **THEN** it renders no editable control for that field

### Requirement: A merged field's control edits the delta it actually submits, never the resolved value
For a field whose override permission is `merged` with strategy `union-list` or `append-list`, the
editor SHALL present a control for the items to add on top of the field's inherited value, showing
the inherited value as non-editable context, and SHALL submit only the added items as the field's
override — never the full resolved list. For a field whose override permission is `merged` with
strategy `shallow-object`, the editor SHALL present one independent, optional control per subkey the
inherited value declares, and SHALL submit only the subkeys an operator actually changed as the
field's override — never the whole object.

#### Scenario: A union-list field's control only submits the added items
- **WHEN** an operator adds one item to a `union-list` field's control and saves
- **THEN** the request's override for that field contains only the added item, not the field's full
  inherited list plus the addition

#### Scenario: A shallow-object field's control only submits the changed subkeys
- **WHEN** an operator changes one subkey of a `shallow-object` field's control and saves, leaving
  every other subkey's control untouched
- **THEN** the request's override for that field contains only the changed subkey

### Requirement: A field's shown current value reflects its real merge outcome
Wherever a ruleset override field's current value is displayed — including the plain-language
summary's rules section — it SHALL reflect the field's actual effective value after applying its
declared merge strategy to the stored override and the discipline's default, never the raw stored
override value alone for a `merged` field.

#### Scenario: A union-list field's displayed value includes the inherited items
- **WHEN** a `union-list` field's stored override adds one item to the discipline's inherited list
- **THEN** the value shown for that field includes both the inherited items and the added item, not
  only the added item

#### Scenario: A shallow-object field's displayed value includes untouched subkeys
- **WHEN** a `shallow-object` field's stored override changes only one subkey
- **THEN** the value shown for that field includes every subkey's current value, not only the changed
  one

### Requirement: A field with no declared policy keeps a raw-text fallback
A stored override whose dot-path names no field the installed discipline's `fieldPolicies` declares
(for example, data from a prior descriptor version) SHALL remain editable as raw JSON text, marked as
unrecognized, rather than being hidden or crashing the editor.

#### Scenario: An undeclared field stays editable as text
- **WHEN** a tournament's stored overrides include a dot-path absent from the installed discipline's
  current `fieldPolicies`
- **THEN** the editor still shows it, as a raw-text control, and marks it as not governed by a known
  field policy

### Requirement: The wizard offers a typed control for every discipline-declared ruleset field
For every field the selected discipline declares an override policy for, the tournament-creation
wizard SHALL offer a typed control chosen the same way the post-creation ruleset editor chooses one
(by the field's override permission, merge strategy, and the runtime type of its default value) —
except a field the wizard already captures through a dedicated control (`format` or a
`registration.*` field), which SHALL NOT also be offered through this generic control, so no field
is ever editable through two different wizard controls at once. A field whose override permission
is `inherited` or `forbidden` SHALL NOT be offered a control.

#### Scenario: A discipline-specific field is configurable during creation
- **WHEN** an organizer selects a discipline that declares an override policy for a field beyond
  `format`/`registration.*` (for example a scoring or venue-policy field)
- **THEN** the wizard offers a typed control for that field before the tournament is created, and a
  value set there reaches the created tournament's ruleset

#### Scenario: A field with a dedicated wizard control is not offered twice
- **WHEN** the wizard renders its generic per-field controls for the selected discipline
- **THEN** `format` and every `registration.*` field already captured by the wizard's own dedicated
  controls are excluded from the generic list

#### Scenario: A forbidden or inherited field offers no control during creation
- **WHEN** the wizard encounters a field whose override permission is `forbidden` or `inherited`
- **THEN** it renders no editable control for that field, matching the post-creation editor's
  behavior for the same policy

### Requirement: A rejected creation-time rule override fails tournament creation atomically
If a rule override submitted at tournament-creation time is rejected by the same validation the
post-creation ruleset editor uses (an undeclared field, a `forbidden`/`inherited` permission, or a
shape the field's merge strategy cannot apply), tournament creation SHALL fail entirely — the
tournament, its stages, and its ruleset SHALL NOT be persisted in a partially-configured state.

#### Scenario: An invalid rule override blocks the entire creation
- **WHEN** an organizer submits a tournament-creation request whose rule overrides include a field
  rejected by its declared policy
- **THEN** the request fails and no tournament, stage, or ruleset record is created
