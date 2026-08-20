# live-match-console Specification

## Purpose

Gives an authorized match official a discipline-aware console and authoritative supporting contracts
to record live match events, control a match, and finalize it through an audited, irreversible flow.

## Requirements

### Requirement: Authorized console projection is authoritative
The system SHALL provide a protected match-console projection containing the authoritative match
status, resolved score and statistics, active segment and elapsed time, event history, active timers,
eligible attribution data, active discipline presentation metadata, and the current subject's
match-scoped capabilities. The console SHALL initialize and recover from that projection rather than
assembling mutable operator state from public reads.

#### Scenario: Console receives complete operator state
- **WHEN** an authorized official opens the console for an assigned match
- **THEN** the system returns one projection sufficient to render the current match state, permitted
  actions, and event-entry controls

#### Scenario: Public read remains sanitized
- **WHEN** an anonymous client reads a public match projection
- **THEN** it does not receive operator capabilities, eligible attribution data, or other console-only
  fields

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

### Requirement: Clock and timer operations are authorized auditable commands
Manual clock adjustment, segment selection, and timer resolution SHALL be explicit server-validated
commands. Each SHALL require its independently granted match capability, record actor, timestamp,
prior state, and resulting state, and accept only timer-resolution behavior declared for the active
discipline.

#### Scenario: Referee adjusts the active period
- **WHEN** an official with the clock-control capability changes the active segment or elapsed time
- **THEN** the system records the prior and resulting clock state and returns an authoritative
  projection

#### Scenario: Invalid timer resolution is rejected
- **WHEN** an official attempts to resolve a timer without its required capability or through a path
  not declared for that timer
- **THEN** the system rejects the operation without changing the timer state

### Requirement: Active timers are visible authorized objects
Every active timer SHALL be displayed as a visible object with its type, affected team or participant,
and remaining time, with its declared resolution action available only to an authorized role.

#### Scenario: Unauthorized user cannot resolve a timer
- **WHEN** a user without match-scoped timer-resolution authorization attempts to resolve an active timer
- **THEN** the action is rejected

### Requirement: Finalize is an irreversible, explicitly confirmed, idempotent action
Finalizing a match SHALL require an explicit confirmation step warning that the result becomes part
of an immutable ledger and cannot be undone. The client SHALL supply an idempotency key, which the
server SHALL persist atomically with the finalization result. A retry with the same key and request
SHALL return the recorded outcome; reuse of that key with a different request SHALL be rejected.

#### Scenario: Finalize requires explicit confirmation
- **WHEN** an official initiates match finalization
- **THEN** the system shows a destructive-confirmation dialog naming the immutable-ledger consequence before any commit occurs

#### Scenario: Duplicate finalize retry has one outcome
- **WHEN** a finalize request is submitted twice with the same idempotency key and request body
- **THEN** exactly one finalize commit is recorded and both responses identify that same outcome

#### Scenario: Idempotency key cannot represent different finalizations
- **WHEN** a client reuses a finalize idempotency key with different result data
- **THEN** the system rejects the request without changing the finalized result

### Requirement: Displayed state reconciles with an authoritative projection
Any optimistically displayed score, statistic, timer, or match-state update SHALL reconcile with the
next authoritative versioned match projection delivered through the durable event stream. If no newer
projection arrives within a bounded timeout, the console SHALL show stale state and refetch the
projection rather than trusting the optimistic value indefinitely.

#### Scenario: Optimistic update reconciles
- **WHEN** the console optimistically updates state after an event is recorded
- **AND** the server's authoritative projection differs
- **THEN** the console visibly updates to the authoritative value rather than continuing to show the stale optimistic one

#### Scenario: Reconciliation expires
- **WHEN** an optimistic mutation is not reconciled before the configured timeout
- **THEN** the console marks its state stale and requests a fresh authoritative projection

### Requirement: Match-scoped capability-based authorization
Only an active organization `admin` or `referee` identity SHALL reach match control, and every event
entry, clock control, roster selection, timer resolution, and match finalization action SHALL be
independently authorized for the specific match. An organization role SHALL NOT substitute for a
match capability grant. The console SHALL expose a roster as the selected eligible players for one
entrant in one match, never as a team-membership list.

#### Scenario: Referee with assigned event entry can record an event
- **WHEN** an active referee holds `match.record-event` for a match
- **THEN** the referee can record an event for that match without receiving a broader admin role

#### Scenario: Referee without finalize capability cannot finalize
- **WHEN** a referee has event-entry authorization for a match but not finalize authorization
- **THEN** the finalize action is unavailable or rejected for that user

### Requirement: Operational telemetry is truthful
The console SHALL display stream latency, packet loss, spectator count, and stream uptime only when
a measured source provides the value and source metadata. A metric without a measured source SHALL be
shown as unavailable and SHALL NOT be replaced with an estimated or placeholder value.

#### Scenario: Telemetry source is unavailable
- **WHEN** no telemetry source provides packet-loss data for a match
- **THEN** the packet-loss tile is labelled unavailable rather than displaying a fabricated value

### Requirement: Match console renders tactile dual jersey number grids

The match console (Screen A2) SHALL render side-by-side interactive jersey number button grids for competing entrants, displaying jersey numbers, names, tactical roles, and active on-field status.

#### Scenario: Operator selects an active player via jersey button
- **WHEN** an operator taps a player's jersey button (e.g. `[ #10 Palmer ]`) on Team B's grid
- **THEN** the console sets the selected entrant side to Team B and the primary actor to the corresponding player ID

#### Scenario: Ambient field selection assigns the primary actor and a secondary payload field
- **WHEN** an operator taps a primary player's jersey, switches to a declared secondary field via a chip row (e.g. `assistedBy` for a goal), and taps a teammate's jersey
- **THEN** the recorded event payload sets `personId` to the primary player and `payload.assistedBy` to the selected teammate

#### Scenario: Substitutes on the bench are visually distinguished
- **WHEN** viewing the team jersey grid
- **THEN** players with `onField: false` are rendered in a distinct bench section with a visual substitute indicator

### Requirement: The console provides a roster-selection step that produces what the jersey grid renders

The match console SHALL provide a roster-selection step, reachable before event recording begins and
re-openable while the match is in progress, offering each side's registered players as candidates and
capturing per member a shirt number, the roster roles the discipline declares, and a starter-or-bench
state. The selection SHALL be the source of the tactile jersey grid's contents and of the console's
person-attribution eligibility.

#### Scenario: Selecting each side's roster before recording events
- **WHEN** an operator opens a scheduled match's console and chooses the roster-selection step
- **THEN** each side offers that entrant's registered players as candidates, and a submitted selection
  becomes the jersey grid's contents

#### Scenario: A match with no roster selected is stated, not shown as an empty grid
- **WHEN** an operator opens the console for a match whose roster has never been selected
- **THEN** the console states that no roster is selected and offers the selection step, rather than
  rendering an empty jersey grid

#### Scenario: Starters and substitutes are distinguished at selection
- **WHEN** an operator marks some members as starters and others as substitutes
- **THEN** starters are recorded on-field and substitutes off-field, which is the state the console's
  existing substitution handling then swaps during the match

#### Scenario: A refused selection preserves the operator's entered data
- **WHEN** a submitted selection is refused
- **THEN** the console surfaces the refusal against the offending member and keeps the rest of the
  entered selection in place

#### Scenario: Re-opening the step during a match shows the current selection
- **WHEN** an operator re-opens the roster-selection step after events have been recorded
- **THEN** the current selection is shown for revision, not an empty form
