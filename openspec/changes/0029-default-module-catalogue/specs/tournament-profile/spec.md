## MODIFIED Requirements

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
