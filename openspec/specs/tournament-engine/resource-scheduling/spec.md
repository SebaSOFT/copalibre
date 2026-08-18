# resource-scheduling Specification

## Purpose
Assigns venue, official, and time-slot resources to a tournament's generated fixtures, catching
conflicts before publication and guaranteeing a schedule is never seen half-published.
## Requirements
### Requirement: Conflict detection before commit
The system SHALL detect venue double-booking, official double-booking, and configurable rest-rule
violations before a schedule assignment is committed.

#### Scenario: Double-booked venue is rejected
- **WHEN** a fixture is assigned a venue and time slot that overlaps another fixture already assigned to the same venue
- **THEN** the assignment is rejected with an explicit conflict report naming both fixtures

#### Scenario: Rest-rule violation is rejected
- **WHEN** an entrant is assigned a fixture starting sooner than the configured minimum rest period after their previous fixture
- **THEN** the assignment is rejected with an explicit rest-rule violation report

### Requirement: Downstream-impact preview
Before committing a schedule change, the system SHALL show which already-published fixtures,
notifications, or public views would be affected by the change.

#### Scenario: Rescheduling a published match shows affected downstream items
- **WHEN** an operator proposes moving a published, unstarted match to a new time slot
- **THEN** the system returns a preview listing every already-published fixture, notification, or public view that references the old time before the change is committed

### Requirement: Atomic publication
A schedule or batch of schedule changes SHALL publish in full or not at all; no partially-applied
schedule state SHALL ever be visible on a public surface.

#### Scenario: A batch publish with one invalid assignment fails entirely
- **WHEN** a batch of schedule assignments is submitted for publication and one assignment fails conflict detection
- **THEN** none of the assignments in that batch are published

#### Scenario: Concurrent publish attempts do not interleave
- **WHEN** two schedule-publish operations targeting overlapping resources are submitted concurrently
- **THEN** at most one succeeds atomically and the other is rejected with a conflict, never producing a mixed result

### Requirement: Schedule mutation respects mutation classification
Schedule changes SHALL be classified `safe`, `requires_rebuild`, or `blocked_after_results` per the
domain's mutation model, and the system SHALL enforce that classification.

#### Scenario: Rescheduling a completed match is blocked
- **WHEN** an operator attempts to change the scheduled time of a fixture whose match has already concluded
- **THEN** the system rejects the change as `blocked_after_results`, directing the operator to the audited correction workflow

### Requirement: A venue carries a validated alias

A venue's alias SHALL be validated as a well-formed, URL-safe identifier before it is stored, the same
way every other aliased entity's is — kebab-case, within the platform's alias length limit — and SHALL
be unique within its organization.

#### Scenario: A malformed venue alias is refused before it is stored
- **WHEN** a venue is created or its alias is changed to a value containing uppercase letters, spaces,
  or punctuation other than a single interior hyphen, or exceeding the platform's alias length limit
- **THEN** the write is refused, naming the reason, and no row is written

#### Scenario: A well-formed venue alias is accepted
- **WHEN** a venue is created with a lowercase, kebab-case alias unique within its organization
- **THEN** the venue is stored and reachable by that alias

