## Purpose

Guarantees that once the engine calculates a result, it can only ever change through an audited,
previewed, reason-carrying correction — never a silent overwrite — so every published outcome
remains trustworthy and traceable.

## ADDED Requirements

### Requirement: No direct overwrite of a calculated outcome
The system SHALL NOT provide any endpoint or operation that directly overwrites a game/set, match,
ranking, or advancement outcome once calculated.

#### Scenario: Direct score edit attempt is rejected
- **WHEN** a client attempts to modify a finalized match's score through any path other than the correction workflow
- **THEN** the request is rejected

### Requirement: A correction requires actor, reason, and full state transition
Every correction SHALL record the acting user, a timestamp, an explicit reason, the prior state, and
the replacement state.

#### Scenario: Correction without a reason is rejected
- **WHEN** a correction request omits a reason
- **THEN** the request is rejected before any state changes

#### Scenario: Correction preserves the prior fact
- **WHEN** a correction is committed
- **THEN** the original fact and its prior calculation trace remain retrievable, not deleted or overwritten in place

### Requirement: Corrections preview downstream impact before commit
Before a correction commits, the system SHALL show which standings and future fixtures would change
as a result.

#### Scenario: Correction preview matches actual post-commit effect
- **WHEN** a correction's downstream-impact preview is requested and then the same correction is committed
- **THEN** the standings and fixture changes that actually occur match what the preview showed

### Requirement: Corrections do not auto-propagate into an already-started downstream stage
A correction that would alter a fixture whose downstream stage has already started SHALL be blocked
from automatic propagation, pending explicit authorized resolution.

#### Scenario: Correction affecting a started downstream stage is blocked from auto-propagating
- **WHEN** a correction to an earlier-stage result would change the composition of a later stage that has already started
- **THEN** the correction commits the corrected fact but does not automatically alter the started downstream stage, and surfaces the conflict for authorized resolution

### Requirement: Correction audit trail is queryable
Every correction SHALL be retrievable as part of the match's or tournament's audit history, showing
the full chain of prior states.

#### Scenario: Multiple corrections preserve full history
- **WHEN** a result is corrected more than once
- **THEN** every prior state in the chain remains individually retrievable, in order
