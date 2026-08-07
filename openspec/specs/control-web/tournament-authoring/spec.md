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
classification is `blocked_after_results` and a valid result already exists.

#### Scenario: Blocked edit after a result exists
- **WHEN** an organizer attempts an edit classified `blocked_after_results` on a tournament that already has a recorded match result
- **THEN** the wizard/edit UI rejects the edit and states that an authorized correction workflow is required instead

#### Scenario: Safe edit applies without warning
- **WHEN** an organizer edits a field classified `safe`
- **THEN** the change applies without a rebuild warning or blocking dialog

### Requirement: Public-registration and check-in toggles are explicit tournament settings
The wizard SHALL let the organizer explicitly set whether public registration is open and whether
check-in is required, and SHALL record both as part of the tournament's configuration.

#### Scenario: Check-in requirement is persisted
- **WHEN** an organizer enables "Requires Check-in" during setup
- **THEN** the created tournament's configuration records check-in as required

