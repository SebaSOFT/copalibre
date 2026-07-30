# competition-record Specification

## Purpose
Makes a finished competition self-contained, so its historical record survives the deletion of the
discipline and profile versions that produced it.
## Requirements
### Requirement: Compiled configuration is persisted
The effective ruleset and its resolved capability binding SHALL be persisted when compiled, not
recomputed from the source descriptor on read.

#### Scenario: A tournament is readable after its modules are deleted
- **WHEN** every discipline and profile version a finished tournament referenced is removed
- **THEN** its configuration, results and standings remain readable

### Requirement: Results are materialised incrementally
Each finalised match SHALL write its outcome and the standings as of that point, as it is finalised.

#### Scenario: An abandoned tournament keeps its record
- **WHEN** a tournament is never archived and play stops after several finalised matches
- **THEN** those matches' outcomes and standings remain available

#### Scenario: Live state is still computed
- **WHEN** a match has not been finalised
- **THEN** its advancement and the current standings are computed from the fixture graph and recorded
  facts, not read from a materialised row

### Requirement: Retired module versions are identifiable
The system SHALL be able to report which discipline and profile versions no live tournament
references, so an operator can retire them.

#### Scenario: A version in use is not reported as retirable
- **WHEN** a tournament that has started references a discipline version
- **THEN** that version is not reported as safe to retire

