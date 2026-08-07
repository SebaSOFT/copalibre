# tournament-profile Specification

## Purpose
Makes tournament configuration a reusable, attributable, publishable artifact that declares what it
needs from a discipline rather than pinning a discipline version.
## Requirements
### Requirement: Publishable tournament profile
A `TournamentProfile` SHALL be a versioned artifact carrying attribution and a tournament
configuration (stages, formats, scoring, tiebreak pipeline), instantiable by any number of
tournaments. It SHALL be expressible as a JSON document with a published structural schema, so a
profile authored outside the application is validated as data before it is treated as a profile.

#### Scenario: A profile is reused across tournaments
- **WHEN** two tournaments instantiate the same profile version
- **THEN** both receive identical configuration, and neither can mutate the profile itself

#### Scenario: Attribution travels with the artifact
- **WHEN** a profile or discipline is read
- **THEN** its author, source URL and licence are available without consulting an external source

#### Scenario: A profile authored as a document is validated before use
- **WHEN** a profile arrives as JSON from a catalogue, an import or an API request
- **THEN** it is validated against the profile schema, and a document failing it is rejected
  identifying the offending member rather than partially applied

### Requirement: Capability requirements instead of version pins
A `TournamentProfile` SHALL declare the capability codes it consumes, each marked `required` or
`optional`, and each satisfiable by any one of a declared set of codes.

#### Scenario: One profile spans differently-named disciplines
- **WHEN** a profile requires a primary scoring statistic satisfiable by `goals-for` or `frags`
- **AND** it is compiled against a discipline declaring only `frags`
- **THEN** the requirement is satisfied

#### Scenario: A discipline release does not invalidate a profile
- **WHEN** a discipline publishes a new version that still declares the required codes
- **THEN** the profile remains usable with no new profile release

### Requirement: Capability binding is resolved and recorded
Compiling a profile against a discipline SHALL resolve each capability requirement to that
discipline's concrete code, and the resolved binding SHALL be recorded on the compiled snapshot.

#### Scenario: Tiebreak comparators read through the binding
- **WHEN** a profile's tiebreak pipeline references a capability name
- **THEN** evaluation uses the code the binding resolved it to, not the capability name

#### Scenario: An unsatisfied optional capability degrades rather than fails
- **WHEN** a profile marks a capability optional and the discipline does not declare it
- **THEN** compilation succeeds and the affected comparator is skipped per its `missingValue` behaviour

#### Scenario: An unsatisfied required capability is reported and overridable
- **WHEN** a profile marks a capability required and the discipline does not declare it
- **THEN** the compilation reports the unsatisfied requirement
- **AND** an operator may explicitly override and proceed, with the gap recorded on the binding
