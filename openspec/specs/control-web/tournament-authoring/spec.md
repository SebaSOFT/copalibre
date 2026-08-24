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
request; the wizard SHALL NOT collect a value, validate it, and then discard it before submission.

#### Scenario: Capacity set in the wizard reaches the created tournament
- **WHEN** an organizer sets a participant capacity during the window step and completes the wizard
- **THEN** the created tournament's configuration records that capacity

#### Scenario: Region set in the wizard reaches the created tournament
- **WHEN** an organizer sets a region during the window step and completes the wizard
- **THEN** the created tournament's configuration records that region

### Requirement: Wizard offers every field the API already accepts
A field already accepted by the tournament-creation endpoint SHALL be reachable from the wizard; the
wizard SHALL NOT omit a step for a field the API is already prepared to receive.

#### Scenario: Check-in closing time is configurable in the wizard
- **WHEN** an organizer enables "Requires Check-in" during setup
- **THEN** the wizard offers a field to set when checked-in team memberships stop being editable, and a
  value set there reaches the created tournament's configuration

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
