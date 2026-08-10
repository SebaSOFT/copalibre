# data-import-export Specification

## Purpose

Gives self-hosted operators a reviewed, auditable way to bring bulk data into a tournament and take a
stable-ID copy of it back out, so the platform never traps operator data behind a hosted account.

## Requirements

### Requirement: CSV import requires reviewed confirmation before commit
The system SHALL accept an uploaded CSV of at most 4 MiB, validate it through a durable worker job
against the active discipline and tournament's declared import schema, present a row-level preview of
validation results, and SHALL NOT commit any row until the operator explicitly confirms the reviewed
preview. The declared schema SHALL select whether rows register a new individual entrant, register a
new team entrant, or attach people onto an already-registered team's persistent membership; the
system SHALL NOT infer a sport-specific shape outside that configuration. A roster is a
match-specific player selection and SHALL NOT be imported by this capability.

#### Scenario: Valid rows are previewed before commit
- **WHEN** an operator uploads a CSV with all valid rows
- **THEN** the system shows a preview of the rows to be imported and waits for explicit confirmation before writing any data

#### Scenario: Import is rejected without confirmation
- **WHEN** an operator uploads a CSV and does not confirm the preview
- **THEN** no data is committed

#### Scenario: A roster is not an import target
- **WHEN** an operator submits CSV columns intended to select players for a particular match
- **THEN** validation rejects that row shape and directs roster selection to live match operations

### Requirement: Malformed input is rejected cleanly, never partially committed
A CSV containing malformed or schema-invalid rows SHALL be rejected with row-level, actionable error
messages, and the system SHALL NOT commit a partial import that leaves valid rows applied while
invalid rows are silently dropped.

#### Scenario: Mixed valid/invalid rows block the whole import
- **WHEN** an uploaded CSV contains some valid rows and some schema-invalid rows
- **THEN** the system reports the specific invalid rows and their errors, and does not commit any row until the operator corrects and re-uploads or explicitly excludes the invalid rows through the reviewed preview

### Requirement: Import is an audited operation
Every committed import SHALL produce an audit record with actor, timestamp, and the count/identity of
rows applied.

#### Scenario: Import audit trail exists
- **WHEN** an operator confirms and commits a CSV import
- **THEN** an audit record exists identifying the actor, timestamp, and the imported rows

### Requirement: Export uses stable identifiers
A CSV or structured data export SHALL key exported records by their stable alias (not raw database
UUIDs), so exported data remains referenceable for re-import or external tooling without depending on
internal identifier changes.

#### Scenario: Exported data references aliases
- **WHEN** an operator exports tournament participant data
- **THEN** each exported record is identified by its alias, not a raw UUID

### Requirement: Participant export is the only re-importable export
The system SHALL emit participant, result, and standings exports separately. Only participant export
SHALL conform to the active import schema and be re-importable to correct participant records; result
and standings exports SHALL be read-only records because their calculations remain authoritative in
CopaLibre.

#### Scenario: Participant correction round-trips
- **WHEN** an operator exports participant data, corrects a row, and imports that participant CSV
- **THEN** the reviewed import accepts it according to the tournament and discipline schema

#### Scenario: Results are not treated as mutable input
- **WHEN** an operator requests a results or standings export
- **THEN** the system produces a stable-alias-keyed read-only export and exposes no import path that
  overwrites calculated results or standings

### Requirement: Export escapes formula-injection payloads

Any CSV export cell whose value originates from organizer- or participant-controlled free text
(participant names, team names, aliases, or any other free-text field) SHALL be escaped before
serialization so that a value beginning with `=`, `+`, `-`, or `@` cannot be interpreted as a
formula by a spreadsheet application that opens the exported file.

#### Scenario: Formula-shaped participant name is neutralized on export

- **WHEN** a participant or team name stored in the system begins with `=`, `+`, `-`, or `@`
  (e.g. `=cmd|'/c calc'!A1`)
- **THEN** the exported CSV cell for that value is prefixed so a spreadsheet application opens it
  as inert text, not as a formula

#### Scenario: Ordinary text is exported unchanged

- **WHEN** a participant or team name does not begin with `=`, `+`, `-`, or `@`
- **THEN** the exported CSV cell contains the value exactly as stored, with no added prefix

### Requirement: Export works without a SebaSOFT-hosted account
Export SHALL function on a fully self-hosted installation with no dependency on any SebaSOFT-hosted
service or account.

#### Scenario: Self-hosted export succeeds offline from any hosted service
- **WHEN** an operator triggers an export on a self-hosted installation with no external network access to any SebaSOFT-hosted service
- **THEN** the export completes successfully

### Requirement: CSV import can add people to an already-registered team's membership
The system SHALL support a CSV import target that attaches each row's person to a team named by a
per-row team reference, so one file can populate many teams' persistent membership in one import. The
system SHALL only attach to a team already registered as an entrant in the target tournament; it SHALL
NOT create a team as a side effect of this target, and a row naming a team that is not already a
registered entrant in the tournament SHALL be reported as a row-level validation error in the
reviewed preview, not committed. Committing this target SHALL be additive: a person named in a row who
is already a member of the row's team SHALL be left unchanged, and re-committing the same or an
overlapping CSV SHALL NOT duplicate membership or fail.

#### Scenario: A valid row attaches a person to the named team's membership
- **WHEN** an operator commits a reviewed CSV row naming a person and a team already registered as an entrant in the tournament
- **THEN** the named person becomes (or remains) a member of the named team, without altering any other team's membership

#### Scenario: An unregistered team reference is a validation error, not a new team
- **WHEN** an operator uploads a CSV row naming a team reference that does not match any team already registered as an entrant in the tournament
- **THEN** the reviewed preview reports a row-level validation error for that row, no team is created, and the row is not committed

#### Scenario: Re-importing the same file does not duplicate membership
- **WHEN** an operator commits a CSV import for this target, then commits the same file again
- **THEN** the second commit leaves the resulting team memberships identical to the first, with no duplicate membership and no error

#### Scenario: One file spans multiple teams
- **WHEN** an operator uploads a CSV whose rows name more than one already-registered team
- **THEN** each row's person is attached to that row's own named team, and the reviewed preview and commit apply every row's team reference independently
