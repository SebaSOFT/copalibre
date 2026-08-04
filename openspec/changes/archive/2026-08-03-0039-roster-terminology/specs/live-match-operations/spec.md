## MODIFIED Requirements

### Requirement: Match-scoped capability-based authorization
Event entry, clock control, roster selection, and match finalization SHALL each be separate,
independently grantable permissions scoped to one match, not implied by a generic organizer role. A
roster SHALL mean the selected set of eligible players for one entrant in one match; a player's
membership in a team is not a roster.

#### Scenario: Official with event-entry only cannot finalize
- **WHEN** a user holding only the event-entry capability for a match attempts to finalize it
- **THEN** the request is rejected with 403, even though the same user can successfully record events

#### Scenario: Capability grant is scoped to one match
- **WHEN** a referee is granted match-control capabilities for match A
- **THEN** that grant does not authorize any action on match B
