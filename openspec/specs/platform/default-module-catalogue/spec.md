# default-module-catalogue Specification

## Purpose
Ships an installation with usable first-party disciplines and tournament profiles, expressed as
versioned JSON documents in the same format any submitted module must satisfy, and installed through
an explicit, validated, idempotent seeding step rather than compiled into the application.

## Requirements

### Requirement: The default catalogue is data, not code
Every module a release ships SHALL be a JSON document in the same format an externally authored
module uses, and SHALL be readable and diffable without building or running the application.

#### Scenario: A shipped discipline satisfies the public module format
- **WHEN** a first-party discipline document from the catalogue is validated against the descriptor
  schema
- **THEN** it passes, with no exemption, allowance or field available only to first-party modules

#### Scenario: An operator inspects the catalogue before installing it
- **WHEN** an operator reads the shipped catalogue
- **THEN** every discipline and profile is legible as a document, and copying one is a sufficient
  starting point for authoring a new module

### Requirement: A tournament profile is a validated wire document
A tournament profile SHALL have a published structural schema, and a profile document SHALL be
rejected before it is treated as a profile when it does not satisfy it.

#### Scenario: A malformed profile is refused with the offending member named
- **WHEN** a profile document declares a stage without a format, or a tiebreak entry without a
  capability
- **THEN** validation fails identifying the offending member, and the profile is not installed

#### Scenario: A profile referencing a capability no discipline provides is still valid
- **WHEN** a profile document is structurally valid but requires a capability no installed discipline
  declares
- **THEN** the document passes structural validation, and the unsatisfied capability is reported at
  binding time rather than treated as a malformed document

### Requirement: Shipped profiles are discipline-neutral
A first-party tournament profile SHALL declare what it needs by capability and SHALL NOT name a
discipline or a discipline version.

#### Scenario: One shipped profile runs two disciplines
- **WHEN** a shipped league profile is instantiated once against a discipline declaring `goals-for`
  and once against a discipline declaring `matches-won`
- **THEN** both compile, each tiebreak comparator resolving to that discipline's own code

#### Scenario: A fresh installation can run a tournament without authoring anything
- **WHEN** an operator seeds a new installation and creates a tournament
- **THEN** at least one league shape, one knockout shape and one group-then-playoff shape are
  available to instantiate

### Requirement: Seeding is explicit, validated and audited
Installing the catalogue SHALL be an explicitly invoked operation, never an automatic consequence of
starting or migrating an installation, and SHALL validate every document before writing any of them.

#### Scenario: Starting the application seeds nothing
- **WHEN** an installation starts or runs its migrations
- **THEN** no catalogue document is installed

#### Scenario: One invalid document aborts the whole seeding
- **WHEN** the catalogue contains a document that fails validation
- **THEN** the operation reports which document and which member failed, and no document from that
  run is installed

#### Scenario: Seeding is attributable like any other write
- **WHEN** the catalogue is seeded
- **THEN** each installed module carries the same audit record any other module installation
  produces: actor, timestamp and resulting state

### Requirement: A catalogue document is identified by alias and version
A catalogue document SHALL be identified on disk by an alias and a version, and the installation
SHALL assign its persistent identifier when installing it.

#### Scenario: Re-seeding an installed version changes nothing
- **WHEN** the catalogue is seeded twice
- **THEN** the second run installs nothing, reports each module as already present, and no module
  receives a second identifier

#### Scenario: A new version installs alongside its predecessor
- **WHEN** the catalogue ships a newer version of a discipline already installed
- **THEN** the new version is installed as an additional version
- **AND** a tournament already compiled against the older version continues to resolve against it

#### Scenario: A locally edited module survives re-seeding
- **WHEN** an operator has modified an installed module and the catalogue is seeded again
- **THEN** the operator's version is not overwritten

### Requirement: Catalogue aliases are reserved names
The aliases the catalogue ships SHALL be reserved for first-party modules, and the reservation SHALL
be published so that submission-time validation can enforce it rather than each installation
discovering a collision on its own.

#### Scenario: A submission claiming a reserved alias is refused before acceptance
- **WHEN** a module is submitted to the community catalogue under an alias the first-party catalogue
  ships
- **THEN** validation refuses the submission naming the reserved alias, and the module is never
  published

#### Scenario: A module holding a reserved alias blocks the seeding
- **WHEN** a module installed from outside the curated repository already holds a reserved alias, and
  the catalogue is seeded
- **THEN** the operation reports the alias and the conflicting attribution, installs nothing, and
  leaves the installed module untouched

### Requirement: The reference football discipline declares foul and throw-in vocabulary

The default catalogue's football discipline SHALL declare a foul event and a throw-in event, each using
the descriptor-owned outcome-choice workflow, listing the outcomes that event resolves to as ordinary
event definitions. Card outcomes SHALL reuse the discipline's existing card events rather than declaring
parallel copies. The declarations SHALL introduce no new statistic collector and SHALL carry no victim,
goalkeeper, or deflecting-player attribution.

#### Scenario: A foul offers its declared outcomes
- **WHEN** an official records a foul in a football match
- **THEN** the console presents the outcomes the descriptor declares, and the chosen outcome is recorded
  as an ordinary event

#### Scenario: A foul resolving to no further action is still recorded
- **WHEN** a foul's chosen outcome is that play continues
- **THEN** the foul remains a recorded timeline entry

#### Scenario: Occurrence time comes from the preliminary selection
- **WHEN** an official records a foul and then takes time to choose its outcome
- **THEN** the recorded occurrence time is that of the preliminary selection

#### Scenario: A card reached through a foul counts once, in the existing collectors
- **WHEN** a foul's chosen outcome is a card
- **THEN** the discipline's existing card collectors are incremented, exactly as for a directly recorded
  card

#### Scenario: A started tournament keeps its frozen module version
- **WHEN** a tournament was started on a descriptor version predating these declarations
- **THEN** its event vocabulary is unchanged

### Requirement: A discipline or profile may declare a localized description
A discipline descriptor and a tournament profile document SHALL each accept an optional `description`
field using the same localized-label shape their `name` field already uses, so an operator can tell
modules apart without opening the document.

#### Scenario: A discipline's description renders alongside its name
- **WHEN** an operator browses the module catalogue and a discipline declares a `description`
- **THEN** the description renders in the operator's active language wherever the discipline's name
  renders, falling back to `en` the same way `name` already does

#### Scenario: A description is optional
- **WHEN** a discipline or profile document omits `description`
- **THEN** the document still validates and installs normally

### Requirement: A tournament profile's name is localized
A tournament profile document's `name` SHALL accept the same localized-label shape a discipline
descriptor's `name` already uses, rather than a plain, single-language string.

#### Scenario: An existing plain-string profile name keeps working
- **WHEN** an already-installed tournament profile document has a plain-string `name`
- **THEN** it continues to validate and render exactly as before, since a plain string is one of the
  localized-label shape's two valid forms

#### Scenario: A new profile declares its name in more than one language
- **WHEN** a tournament profile document declares `name` as an object with an `en` key and one or more
  other supported languages
- **THEN** the profile's name renders in the operator's active language, falling back to `en` when the
  active language is absent

### Requirement: A discipline may declare background images
A discipline descriptor SHALL accept an optional `images` field: an array of 1 to 10 references in the
object-storage adapter's `{ "key": string }` shape, each satisfying the JPEG/1440p/2 MiB limits
`module-distribution` enforces at import. Shipped asset filenames SHALL use a zero-padded `01` through
`10` suffix.

#### Scenario: A discipline with no images validates normally
- **WHEN** a discipline descriptor omits `images`
- **THEN** the document still validates and installs normally

#### Scenario: More than 10 images is rejected
- **WHEN** a discipline descriptor declares 11 image references
- **THEN** validation fails identifying the `images` field and the count limit

#### Scenario: An image reference that does not resolve in object storage is rejected
- **WHEN** a discipline descriptor's `images` array names a reference not present in object storage at
  install time
- **THEN** installation fails identifying the unresolved reference, and no partial state is installed

### Requirement: Public tournament pages use discipline background images
On each server-rendered public tournament page request, the public web SHALL randomly select one image
from the tournament discipline's declared `images` and render it as a decorative background at 10%
opacity. Selection SHALL require no client JavaScript and SHALL preserve content contrast,
accessibility, and interaction.

#### Scenario: A discipline declares one or more images
- **WHEN** an anonymous visitor requests any public page for a tournament using that discipline
- **THEN** exactly one declared image is selected for that response and rendered behind page content at
  10% opacity

#### Scenario: A discipline declares no images
- **WHEN** an anonymous visitor requests a public page for a tournament whose discipline omits `images`
- **THEN** no discipline background image or empty placeholder layer is rendered

### Requirement: The reference football discipline declares offside, VAR-review, penalty-shootout, and stoppage-time vocabulary

The default catalogue's football discipline SHALL declare an offside event, a VAR-review event using
the descriptor-owned outcome-choice workflow, a penalty-shootout segment type using the same
tiebreak-segment shape as any other discipline's tiebreak, and a stoppage-time-announcement event. None
of these SHALL introduce a new statistic collector beyond an offside count, and none SHALL carry player
attribution beyond what an ordinary event payload already supports.

#### Scenario: Offside is recorded without affecting score or cards
- **WHEN** an official records an offside event in a football match
- **THEN** it is recorded as a timeline entry and increments only its own count, with no score, card, or
  timed-penalty effect

#### Scenario: A VAR review offers its declared outcomes
- **WHEN** an official initiates a VAR review in a football match
- **THEN** the console presents the outcomes the descriptor declares (play stands, goal disallowed,
  penalty overturned, card upgraded, card rescinded), and the chosen outcome is recorded as an ordinary
  event

#### Scenario: A penalty shootout closes the match like any other decider segment
- **WHEN** a football match reaches its penalty-shootout segment
- **THEN** the segment closes using the same win-condition decider mechanism (target and margin) already
  used for any other discipline's tiebreak segment, with no discipline-specific shootout logic

#### Scenario: Stoppage time is announced as a plain audited record
- **WHEN** an official announces stoppage time in a football match
- **THEN** it is recorded as a timeline entry with no derived effect, alongside whatever clock adjustment
  the console already applies

#### Scenario: A started tournament keeps its frozen module version
- **WHEN** a tournament was started on a football descriptor version predating these declarations
- **THEN** its event vocabulary is unchanged

### Requirement: The reference tennis discipline offers a best-of-five win condition and labels doubles

The default catalogue's tennis discipline SHALL offer a best-of-five win condition as a selectable
alternative to its default best-of-three win condition, using the same segment/tiebreak parameters, and
SHALL label its existing `team` participant type as doubles in the discipline's presentation metadata.

#### Scenario: An organizer selects best-of-five for a tennis tournament
- **WHEN** an organizer configures a tennis tournament to use the best-of-five win condition
- **THEN** the match closes at three sets won rather than two, using the identical set/tiebreak rules as
  the best-of-three win condition

#### Scenario: Doubles is presented as a labeled choice, not a bare "team"
- **WHEN** an organizer chooses a tennis tournament's participant type
- **THEN** the `team` option is presented as doubles, distinguishing it from the `individual` singles
  option

#### Scenario: A started tournament keeps its frozen module version
- **WHEN** a tournament was started on a tennis descriptor version predating this declaration
- **THEN** its available win conditions are unchanged

### Requirement: A locally authored module coexists with the bundled catalogue
A discipline or profile authored in an installation SHALL coexist with the bundled catalogue without
shadowing it. Re-seeding the bundled catalogue SHALL NOT overwrite, retire or reorder a locally authored
module, and a locally authored module SHALL NOT be able to take an alias the bundled catalogue reserves.

#### Scenario: Re-seeding leaves authored modules alone
- **WHEN** the bundled catalogue is re-seeded on an installation holding locally authored modules
- **THEN** the authored modules are untouched and remain installed at their own versions

#### Scenario: An authored module cannot take a reserved alias
- **WHEN** an authored module claims an alias the bundled catalogue reserves
- **THEN** it is refused, naming the reservation

#### Scenario: Both kinds are listed together
- **WHEN** an administrator browses installed modules
- **THEN** bundled and locally authored modules are listed together, each showing its own attribution so
  their origin is distinguishable
