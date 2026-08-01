# live-match-operations Specification

## Purpose
Lets an authorized official record what actually happened in a match — events, segments, timers —
through a discipline-configured, capability-scoped interface, producing the auditable operational
facts the engine calculates results from.
## Requirements
### Requirement: Match-scoped capability-based authorization
Event entry, clock control, lineup selection, and match finalization SHALL each be separate,
independently grantable permissions scoped to one match, not implied by a generic organizer role.

#### Scenario: Official with event-entry only cannot finalize
- **WHEN** a user holding only the event-entry capability for a match attempts to finalize it
- **THEN** the request is rejected with 403, even though the same user can successfully record events

#### Scenario: Capability grant is scoped to one match
- **WHEN** a referee is granted match-control capabilities for match A
- **THEN** that grant does not authorize any action on match B

### Requirement: Events are recorded against the discipline's event-definition registry
A recorded event SHALL reference a valid event definition for the match's discipline, occur within a
permitted segment, and validate its payload against that event definition's schema.

#### Scenario: Event type invalid for the discipline is rejected
- **WHEN** an event is recorded whose type is not defined for the match's active discipline
- **THEN** the recording is rejected before any state changes

#### Scenario: Event categorized as positive/negative/neutral does not itself change score
- **WHEN** an event is recorded with a category (positive, negative, or neutral)
- **THEN** the category alone does not alter score, statistics, or match state; only the event definition's explicitly configured effects do

### Requirement: Timed penalties are auditable state, not bare event records
A timed penalty SHALL record its start, duration, affected actor, and its resolution or expiry as
auditable event/state data, and SHALL be visible as a live timer object.

#### Scenario: Timed penalty resolution is recorded
- **WHEN** a timed penalty expires or is explicitly resolved by an authorized official
- **THEN** the resolution is recorded with actor, timestamp, and resulting state, distinct from the original penalty event

### Requirement: Event-triggered notifications are idempotent
A threshold- or cooldown-based notification rule SHALL fire at most once per qualifying threshold
crossing, even across reconnects, refreshes, or recalculation.

#### Scenario: Reconnect does not duplicate a notification
- **WHEN** a client reconnects after a threshold-crossing notification has already fired
- **THEN** the notification is not re-delivered as a new alert

### Requirement: Finalization triggers advancement
Finalizing a match SHALL invoke the tournament engine's advancement computation so downstream
fixtures unlock correctly for the match's format.

#### Scenario: Elimination match finalization populates the next round
- **WHEN** an elimination-format match is finalized
- **THEN** the winner (and, for double elimination, the loser) is routed to the correct downstream fixture per the advancement engine

