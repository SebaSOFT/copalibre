# competition-record Specification

## Purpose
Makes a finished competition self-contained, so its historical record survives the deletion of the
discipline and profile versions that produced it.

## Requirements

### Requirement: Compiled configuration is persisted
The effective ruleset and its resolved capability binding SHALL be persisted when compiled, not
recomputed from the source descriptor on read. A stage that refines its tournament's ruleset SHALL have
its own compiled snapshot, and a reader scoped to that stage SHALL receive the stage's snapshot rather
than its tournament's whenever one exists.

#### Scenario: A tournament is readable after its modules are deleted
- **WHEN** every discipline and profile version a finished tournament referenced is removed
- **THEN** its configuration, results and standings remain readable

#### Scenario: A discipline's default-declared rules reach the read path unconfigured
- **WHEN** a discipline module declares a default notification or collector-threshold rule in its own
  configuration, and an organizer creates a tournament under it without touching that configuration
- **THEN** a match event that satisfies the rule's declared condition raises it, the same as it would
  had the organizer declared the identical rule as an explicit override

#### Scenario: A stage-level ruleset override is read back at its own stage
- **WHEN** a stage's configuration overrides a field its tournament's ruleset also declares, and a match
  belonging to that stage is read
- **THEN** the compiled configuration read for that match reflects the stage's override, not the
  tournament's un-overridden value

#### Scenario: A stage declaring no configuration of its own reads its tournament's snapshot
- **WHEN** a stage has no stage-level configuration
- **THEN** a match belonging to that stage reads its tournament's compiled snapshot

### Requirement: Results are materialised incrementally
Each finalised match SHALL write its outcome and the standings as of that point, as it is finalised,
**including the per-person breakdown of each side's totals where the discipline declares participant
statistics**.

#### Scenario: An abandoned tournament keeps its record
- **WHEN** a tournament is never archived and play stops after several finalised matches
- **THEN** those matches' outcomes and standings remain available

#### Scenario: Live state is still computed
- **WHEN** a match has not been finalised
- **THEN** its advancement and the current standings are computed from the fixture graph and recorded
  facts, not read from a materialised row

#### Scenario: The breakdown survives the module that named it
- **WHEN** a stored result is read after the discipline module that declared its statistic codes is
  deleted
- **THEN** the side totals and each contributor's totals remain readable under the codes they were
  recorded with

### Requirement: Retired module versions are identifiable
The system SHALL be able to report which discipline and profile versions no live tournament
references, so an operator can retire them.

#### Scenario: A version in use is not reported as retirable
- **WHEN** a tournament that has started references a discipline version
- **THEN** that version is not reported as safe to retire
