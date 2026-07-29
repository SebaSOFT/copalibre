## Purpose

Gives tournaments and circuits explicit lifecycle states and an archival/retention policy so
completed competitions leave the active surface without ever silently losing authoritative data —
TMS-014.

## ADDED Requirements

### Requirement: Explicit lifecycle states
A tournament or circuit SHALL have an explicit lifecycle state of draft, published, in progress,
completed, or archived, and SHALL only transition between states via defined legal transitions.

#### Scenario: Illegal transition is rejected
- **WHEN** an operator attempts to move a completed tournament directly back to "in progress" without
  an authorized exception
- **THEN** the system rejects the transition and reports it as illegal

#### Scenario: Legal transition succeeds
- **WHEN** an operator marks a tournament whose final stage is complete as "completed"
- **THEN** the transition succeeds and the tournament's state reflects "completed"

### Requirement: Archival without deletion
An operator SHALL be able to archive a completed tournament or circuit, which SHALL change its
default visibility without deleting any authoritative data.

#### Scenario: Archived tournament is excluded from active listings
- **WHEN** a tournament is archived
- **THEN** it no longer appears in default active-tournament dashboards or public listings, while its
  own public page remains reachable at its existing canonical URL

#### Scenario: Archiving does not delete data
- **WHEN** a tournament is archived
- **THEN** all of its results, standings, audit history, and registrations remain intact and
  unmodified in the authoritative store

### Requirement: Archived data remains exportable
Archived tournament data SHALL remain eligible for export via the existing CSV export path.

#### Scenario: Export succeeds on archived data
- **WHEN** an operator requests a CSV export for an archived tournament
- **THEN** the export succeeds and includes the same data it would have included before archival

### Requirement: Retention policy governs eventual deletion
Archived data SHALL only become eligible for deletion after a configured retention period, and
deletion SHALL require an explicit operator-initiated action, never an automatic silent deletion.

#### Scenario: Deletion requires explicit action after retention period
- **WHEN** an archived tournament's configured retention period has elapsed
- **THEN** it becomes eligible for deletion, but is not deleted until an operator explicitly initiates
  deletion

#### Scenario: Deletion before retention period elapses is blocked
- **WHEN** an operator attempts to delete archived data before its retention period has elapsed
- **THEN** the system rejects the deletion request
