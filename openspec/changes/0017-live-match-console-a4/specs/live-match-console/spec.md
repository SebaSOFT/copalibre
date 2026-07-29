## Purpose

Gives an authorized match official a discipline-aware console to record live match events and
control the clock, ending in an irreversible, explicitly-confirmed finalize action that commits an
audited, immutable result.

## ADDED Requirements

### Requirement: Discipline-aware event palette
The event palette SHALL be rendered from the active discipline's event-definition registry and SHALL
contain only event types valid for the current discipline, match state, actor, and selected segment.

#### Scenario: Palette differs by discipline
- **WHEN** the console opens for a football match versus a basketball match
- **THEN** the rendered event palette differs according to each discipline's event-definition registry, with no shared hardcoded event set

#### Scenario: Invalid event is not offered
- **WHEN** an event type is not valid for the current match state or segment
- **THEN** that event type does not appear in the palette

### Requirement: Conditional event workflow
An event entry SHALL support branching to a quick outcome choice before opening its final form, when
the discipline's event definition declares that behavior.

#### Scenario: Penalty branches to goal or missed
- **WHEN** an official selects the penalty event type
- **THEN** the console presents a goal/missed choice before opening the confirmation form, prefilled with event type, active period, and event time

### Requirement: Active timers are visible, authorized objects
Every active timer (e.g. a timed sanction) SHALL be displayed as a visible object with its type,
affected team or participant, and remaining time, with dismissal or resolution available only to an
authorized role.

#### Scenario: Unauthorized user cannot dismiss a timer
- **WHEN** a user without match-scoped timer-resolution authorization attempts to dismiss an active timer
- **THEN** the action is rejected

### Requirement: Finalize is an irreversible, explicitly confirmed action
Finalizing a match SHALL require an explicit confirmation step warning that the result becomes part
of an immutable ledger and cannot be undone, and SHALL NOT be reachable via a single click or be
double-submittable.

#### Scenario: Finalize requires explicit confirmation
- **WHEN** an official initiates match finalization
- **THEN** the system shows a destructive-confirmation dialog naming the immutable-ledger consequence before any commit occurs

#### Scenario: Duplicate finalize submission is rejected
- **WHEN** a finalize request is submitted twice in rapid succession (e.g. double-click or network retry)
- **THEN** only one finalize commit is recorded, and the second attempt is rejected or treated as a no-op

### Requirement: Displayed score reconciles with authoritative recalculation
Any optimistically displayed score or statistic update SHALL reconcile with the value returned by the
server's authoritative recalculation, and the UI SHALL NOT allow the two to silently diverge without
surfacing a correction.

#### Scenario: Optimistic update reconciles
- **WHEN** the console optimistically updates the displayed score after an event is recorded
- **AND** the server's authoritative recalculation returns a different value
- **THEN** the console visibly updates to the authoritative value rather than continuing to show the stale optimistic one

### Requirement: Match-scoped, capability-based authorization
Event entry, clock control, lineup selection, and match finalization SHALL be independently
authorized capabilities scoped to the specific match, not implied by a generic organizer role.

#### Scenario: Referee without finalize capability cannot finalize
- **WHEN** a user has event-entry authorization for a match but not finalize authorization
- **THEN** the finalize action is unavailable or rejected for that user
