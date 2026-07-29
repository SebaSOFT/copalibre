## Purpose

Gives self-hosted operators a reviewed, auditable way to bring bulk data into a tournament and take a
stable-ID copy of it back out, so the platform never traps operator data behind a hosted account.

## ADDED Requirements

### Requirement: CSV import requires reviewed confirmation before commit
The system SHALL validate an uploaded CSV against the active discipline/tournament schema, present a
row-level preview of validation results, and SHALL NOT commit any row until the operator explicitly
confirms the reviewed preview.

#### Scenario: Valid rows are previewed before commit
- **WHEN** an operator uploads a CSV with all valid rows
- **THEN** the system shows a preview of the rows to be imported and waits for explicit confirmation before writing any data

#### Scenario: Import is rejected without confirmation
- **WHEN** an operator uploads a CSV and does not confirm the preview
- **THEN** no data is committed

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

### Requirement: Export works without a SebaSOFT-hosted account
Export SHALL function on a fully self-hosted installation with no dependency on any SebaSOFT-hosted
service or account.

#### Scenario: Self-hosted export succeeds offline from any hosted service
- **WHEN** an operator triggers an export on a self-hosted installation with no external network access to any SebaSOFT-hosted service
- **THEN** the export completes successfully
