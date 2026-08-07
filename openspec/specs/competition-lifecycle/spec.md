# competition-lifecycle Specification

## Purpose

Gives tournaments explicit lifecycle states and an archival policy so completed competitions leave
the active surface without ever silently losing authoritative data — TMS-014, scoped to Tournament
only (Circuit is deferred at the product level; retention and deletion are deferred to a future
change per the owner's decision).

## Requirements

### Requirement: Explicit lifecycle states
A tournament SHALL have an explicit lifecycle state of `draft`, `published`, `started`, `finished`,
or `archived`, and SHALL only transition between states via defined legal transitions.

#### Scenario: Illegal transition is rejected
- **WHEN** an operator attempts to move a `started` tournament directly to `archived`
- **THEN** the system rejects the transition and reports it as illegal

#### Scenario: Legal transition succeeds
- **WHEN** an operator marks a tournament whose final stage is complete as `finished`
- **THEN** the transition succeeds and the tournament's state reflects `finished`

### Requirement: Archival without deletion
An operator SHALL be able to archive a `finished` tournament, which SHALL change its default
visibility without deleting any authoritative data.

#### Scenario: Archived tournament is excluded from active listings
- **WHEN** a tournament is archived
- **THEN** it no longer appears in a default active-tournament listing built through the shared
  active-only filter, while its own public page remains reachable at its existing canonical URL

#### Scenario: Archiving does not delete data
- **WHEN** a tournament is archived
- **THEN** all of its results, standings, audit history, and registrations remain intact and
  unmodified in the authoritative store

#### Scenario: Archival is only legal from finished
- **WHEN** an operator attempts to archive a tournament that is not currently `finished`
- **THEN** the system rejects the transition and reports it as illegal

### Requirement: Archived data remains exportable
Archived tournament data SHALL remain eligible for export via the existing CSV export path.

#### Scenario: Export succeeds on archived data
- **WHEN** an operator requests a CSV export for an archived tournament
- **THEN** the export succeeds and includes the same data it would have included before archival
