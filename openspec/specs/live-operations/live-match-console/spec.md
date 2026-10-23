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

Manual clock adjustment, segment Start/Pause/End, segment selection, and timer resolution SHALL be
explicit server-validated commands, each requiring its independently granted match capability,
recording actor, timestamp, prior and resulting state, and accepting only timer resolution the
active discipline declares. Start, Pause, and End SHALL require the `match.control-clock` capability
manual adjustment requires. The segment selector SHALL show segment types and states in the active
language.

#### Scenario: Referee adjusts the active period
- **WHEN** an official with the clock-control capability changes the active segment or elapsed time
- **THEN** the system records the prior and resulting clock state and returns an authoritative
  projection

#### Scenario: Referee starts a segment's clock
- **WHEN** an official with the clock-control capability issues a Start command for the active segment
- **THEN** the system records the prior (not-running) and resulting (running) clock state, and the
  console reflects the clock advancing

#### Scenario: Referee pauses a running segment's clock
- **WHEN** an official with the clock-control capability issues a Pause command while the segment's
  clock is running
- **THEN** the system records the prior (running) and resulting (paused) clock state at the paused
  elapsed time

#### Scenario: Referee ends a segment's clock
- **WHEN** an official with the clock-control capability issues an End command for the active segment
- **THEN** the system records the resulting (ended) clock state and the segment is no longer eligible
  for further Start/Pause commands

#### Scenario: Start/Pause/End require the same capability as manual adjustment
- **WHEN** an official without the clock-control capability issues a Start, Pause, or End command
- **THEN** the system rejects the command without changing the clock state

#### Scenario: Invalid timer resolution is rejected
- **WHEN** an official attempts to resolve a timer without its required capability or through a path
  not declared for that timer
- **THEN** the system rejects the operation without changing the timer state

#### Scenario: Segment selection options render localized types and states
- **WHEN** an operator opens the segment selector
- **THEN** segment options display localized segment types and states (e.g. "Tiempo 1 · completado"
  instead of "half 1 · completed") according to the active language.

### Requirement: Active timers are visible authorized objects
Every active timer SHALL be displayed as a visible object with its type, affected team or participant,
and remaining time, with its declared resolution action available only to an authorized role.

#### Scenario: Unauthorized user cannot resolve a timer
- **WHEN** a user without match-scoped timer-resolution authorization attempts to resolve an active timer
- **THEN** the action is rejected

### Requirement: Finalize is an irreversible, explicitly confirmed, idempotent action

Finalizing a match SHALL require an explicit confirmation that shows the outcome being frozen and
warns it cannot be undone. The server SHALL persist the client's idempotency key atomically with the
result: a same-key, same-request retry SHALL return the recorded outcome, and a different request
under that key SHALL be rejected. The outcome SHALL be derived from the recorded events or chosen
through a control whose only purpose is to choose it, and SHALL NOT be a value set for another
purpose.

#### Scenario: Finalize requires explicit confirmation
- **WHEN** an official initiates match finalization
- **THEN** the system shows a destructive-confirmation dialog naming the immutable-ledger consequence before any commit occurs

#### Scenario: Duplicate finalize retry has one outcome
- **WHEN** a finalize request is submitted twice with the same idempotency key and request body
- **THEN** exactly one finalize commit is recorded and both responses identify that same outcome

#### Scenario: Idempotency key cannot represent different finalizations
- **WHEN** a client reuses a finalize idempotency key with different result data
- **THEN** the system rejects the request without changing the finalized result

#### Scenario: An attribution selection never becomes the winner
- **WHEN** an official taps a jersey to attribute an event to one side and then finalizes the match
- **THEN** the finalize request carries no winner derived from that tap, and the recorded outcome is
  the one the events support or the one an explicit winner control was set to

#### Scenario: The confirmation shows what is being frozen
- **WHEN** the confirmation step for finalization is shown
- **THEN** it presents the score and the winner about to be committed, so the official confirms a
  visible outcome rather than an unnamed one

#### Scenario: The warning names the ledger

- **WHEN** the confirmation is shown
- **THEN** it warns that the result becomes part of an immutable ledger and cannot be undone

#### Scenario: What the confirmation shows

- **WHEN** the confirmation is shown
- **THEN** it shows the score, and the winner where one is recorded, because a confirmation naming
  only the consequence cannot be checked against what is about to be committed

#### Scenario: An explicit winner control starts unset

- **WHEN** a console offers an explicit winner control
- **THEN** it defaults to unset, and finalizing with it unset derives the outcome from the recorded
  events or refuses, rather than submitting whichever side was last touched

#### Scenario: The confirm action looks like a commit

- **WHEN** the confirm affordance renders
- **THEN** it carries the tone the system uses for an irreversible commit, not the tone reserved for
  a failure or a loss

### Requirement: Displayed state reconciles with an authoritative projection

Any optimistically displayed score, statistic, timer, or match-state update SHALL reconcile with the
next authoritative versioned match projection from the durable event stream. If none arrives within
a bounded timeout, the console SHALL show stale state and refetch the projection. After a
reconnection replays a durable queue, the console SHALL NOT keep displaying an optimistic value the
authoritative projection has superseded.

#### Scenario: Optimistic update reconciles
- **WHEN** the console optimistically updates state after an event is recorded
- **AND** the server's authoritative projection differs
- **THEN** the console visibly updates to the authoritative value rather than continuing to show the stale optimistic one

#### Scenario: Reconciliation expires
- **WHEN** an optimistic mutation is not reconciled before the configured timeout
- **THEN** the console marks its state stale and requests a fresh authoritative projection

#### Scenario: A drained queue reconciles to the authoritative outcome
- **WHEN** a reconnection drains a queue of several actions, some accepted and one refused
- **THEN** the console's displayed state reflects the authoritative projection resulting from exactly
  what the server accepted, not an optimistic guess that assumed every queued action would succeed

#### Scenario: A whole replayed queue reconciles like one mutation

- **WHEN** a queued set of actions is replayed after a reconnection
- **THEN** the resulting state reconciles exactly as a single mutation's would

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

### Requirement: A dedicated screen loads match data without a live console session

The console SHALL offer a "load match data" screen, distinct from the live match console, for entering
a match's roster, ordered event list, and result in one review-then-submit action, with no requirement
to step through segment clocks or record events in real time.

#### Scenario: An operator transcribes a scoresheet after the fact
- **WHEN** an operator opens the load-match-data screen for a scheduled match with no prior console
  activity
- **THEN** they can enter the roster, build an ordered event list, and review it before submitting,
  with no live clock or active-segment requirement anywhere in the flow

#### Scenario: A rejected submission is correctable, not lost
- **WHEN** a submission is rejected because one event entry is invalid
- **THEN** the screen retains the operator's entered data (roster and every event, including the
  invalid one) so it can be corrected and resubmitted, rather than requiring the whole entry to be
  redone

#### Scenario: The live console is unaffected
- **WHEN** an operator uses the live match console for a different match, or the same match before this
  screen exists in their workflow
- **THEN** its real-time behavior is unchanged — this screen is an additional path, not a modification
  of the existing one

### Requirement: The load-match-data screen accepts a CSV import as an alternative to manual entry

The load-match-data screen SHALL accept a CSV file describing one match's roster, ordered events,
and result, parsed into the structured submission manual entry produces. Imported content SHALL load
into the event-list builder for review, and SHALL be submitted through the same batch endpoint,
validation and all-or-nothing transaction. Problems SHALL be reported for every offending row at
once, before anything is submitted.

#### Scenario: Importing a well-formed file
- **WHEN** an operator imports a CSV describing a match's roster, events and result
- **THEN** the content loads into the event-list builder for review, and submitting it records the match
  exactly as the same content entered by hand would

#### Scenario: A malformed file reports every bad row
- **WHEN** an imported CSV has problems in several rows
- **THEN** every offending row is reported at once, and nothing is submitted

#### Scenario: An import is reviewable before it commits
- **WHEN** an operator imports a file
- **THEN** nothing is written until the operator submits the reviewed content

#### Scenario: An import is subject to identical validation
- **WHEN** an imported batch contains an event the discipline's definitions reject
- **THEN** it is refused exactly as the same event entered by hand would be, and no part of the match is
  written

### Requirement: Every mutating console command carries a durable idempotency key

The console SHALL generate a client-side idempotency key for every mutating command it sends — event
recording, clock adjustment, timer resolution, roster selection, and finalization — and the server
SHALL persist that key atomically with the command's recorded outcome. A retry carrying the same key
and the same request SHALL return the previously recorded outcome without re-applying the command.
Reuse of that key with a different request SHALL be rejected.

#### Scenario: A retried event recording is not double-recorded
- **WHEN** a client retries the same event-recording request with the same idempotency key, because the
  first response was lost
- **THEN** exactly one event is recorded, and both responses identify that same outcome

#### Scenario: A retried roster selection is not double-applied
- **WHEN** a client retries the same roster-selection request with the same idempotency key
- **THEN** the roster is set exactly once, and both responses identify that same outcome

#### Scenario: Reusing a key with a different request is rejected
- **WHEN** a client reuses an idempotency key already recorded against a different request for any
  mutating console command
- **THEN** the system rejects the new request without applying it

### Requirement: The console durably queues an action it cannot send

When a mutating console command cannot be sent — the client is offline, or the send attempt fails for a
network reason — the console SHALL persist that action in a durable, client-local queue instead of only
reporting an error and discarding it. The queue SHALL treat a brief connectivity loss and a sustained
one identically; there SHALL be no separate mechanism for a short blip versus an extended outage.

#### Scenario: Losing connectivity mid-action queues it
- **WHEN** an operator submits a mutating command while the client has no network connectivity
- **THEN** the action is durably queued rather than reported as a plain failure and discarded

#### Scenario: A short blip and a sustained outage queue identically
- **WHEN** connectivity is lost for a few seconds, or for many minutes
- **THEN** in both cases the console's queuing and later replay behavior is the same

### Requirement: A queued action survives a page refresh

An action durably queued by the console SHALL remain queued across a page reload, or the console tab
being closed and reopened, and the console SHALL resume attempting to send it once reachable again.
In-progress input that the operator had not yet attempted to submit — a selection, typed text, or an
open workflow choice awaiting confirmation — is not required to survive a refresh.

#### Scenario: A refresh does not lose a queued action
- **WHEN** an operator refreshes the page while an action is queued and unsent
- **THEN** reopening the console shows that action still queued, and the console resumes attempting to
  send it

#### Scenario: Unsubmitted draft input is not restored after a refresh
- **WHEN** an operator refreshes the page while in the middle of composing an action that was never
  submitted
- **THEN** that in-progress input is not restored — unchanged from today's behavior

### Requirement: A reconnection replays the queue through the same validation a live action already goes through

On regaining connectivity, the console SHALL replay every durably queued action, in original order,
through the same authorized command endpoint and validation a live action uses, with no separate
merge or conflict-resolution logic. An action accepted live SHALL be accepted from the queue; an
action refused live SHALL be refused from the queue, surfaced against that queued item, and SHALL
NOT block the rest. A refusal caused by a series decision SHALL name that series result.

#### Scenario: Queued events from one operator replay alongside events recorded by others
- **WHEN** a reconnection replays queued event-recording actions for a match that also received other
  events, recorded by other operators, while this operator was offline
- **THEN** the queued events are recorded in their original order, alongside the events recorded by
  others, with no event lost or silently dropped

#### Scenario: A queued action refused by live validation is refused from the queue too
- **WHEN** a queued roster selection is replayed for a match that was finalized while its operator was
  offline
- **THEN** the queued action is refused exactly as a live submission would be, and the refusal is
  surfaced against that specific queued item

#### Scenario: A conflicting queued finalize is refused, not merged
- **WHEN** a queued finalize action is replayed for a match already finalized with a different result
- **THEN** the queued finalize is refused and surfaced for the operator to resolve explicitly — never
  automatically resubmitted or silently merged with the existing result

#### Scenario: One refused item does not block the rest of the queue
- **WHEN** one queued action among several is refused during replay
- **THEN** the remaining queued actions are still attempted, in order

#### Scenario: A queued action against a match anulled by a series decision is refused, naming the series
- **WHEN** a queued action is replayed for a match that became not-required because its series was
  decided while the operator was offline
- **THEN** the action is refused and surfaced against that queued item, naming the series result that
  anulled the match, and the operator's recorded work is neither applied nor discarded

#### Scenario: The operator can still see what they recorded
- **WHEN** a queued action is refused because its match was anulled
- **THEN** the queued item and its contents remain visible to the operator, so they can decide whether
  it belongs elsewhere — for example as a correction to an earlier match of the same series

#### Scenario: Refusals a live console would also give

- **WHEN** a queued finalize targets a match that is no longer eligible, is already finalized with a
  different result, or was anulled by a series decision taken while the operator was offline
- **THEN** it is refused from the queue

#### Scenario: Why a series refusal names the series

- **WHEN** a queued action targets a match a series decision anulled
- **THEN** the operator is told why the match they recorded against will never be played

### Requirement: Sync status is always visible while the console is open

The console SHALL display, at all times while open — not only when a problem occurs — whether it is
currently online or offline, as a single glanceable icon. The number of actions queued and not yet
confirmed by the server, and when the queue was last successfully drained, SHALL be available on demand
(hover or focus on the icon) rather than permanently occupying the console's visible layout.

#### Scenario: Going offline shows an offline indicator
- **WHEN** the console loses connectivity
- **THEN** the icon visibly switches to its offline state without requiring any operator action

#### Scenario: A queued action is reflected in the visible count
- **WHEN** an action is durably queued because it could not be sent, and an operator focuses or hovers
  the connectivity icon
- **THEN** the on-demand detail shown includes the current queued-action count

#### Scenario: A successful drain updates the last-synced time
- **WHEN** the queue is successfully drained after a reconnection, and an operator focuses or hovers
  the connectivity icon
- **THEN** the on-demand detail shown includes the updated last-synced time

### Requirement: Team and participant references always resolve to a display name
Every team or participant reference rendered anywhere in the match console — the score header, event
recording controls, and roster selection — SHALL resolve to that entrant's display name or short code.
A raw identifier SHALL NOT be rendered as a substitute when a name is unavailable; the console SHALL
instead show a clearly labeled placeholder (e.g. "Unnamed entrant") rather than an internal id.

#### Scenario: The score header shows team names, not ids
- **WHEN** the console renders its score header for a match with two named entrants
- **THEN** both entrants' names (or short codes) are shown, with no raw identifier visible

#### Scenario: An entrant with no resolvable name shows a labeled placeholder, not an id
- **WHEN** the console renders a reference to an entrant whose name cannot be resolved
- **THEN** it shows a clearly labeled placeholder rather than the entrant's raw identifier

### Requirement: The event ledger is collapsible without hiding the most recent events
The console's event ledger SHALL support a collapsed state showing at least the most recently recorded
2-3 events, and an expanded state showing full match history. Collapsing the ledger SHALL NOT hide an
event from the operator who just recorded it. Category filter controls and ledger headings SHALL be
localized according to the operator's active locale.

#### Scenario: A collapsed ledger still shows the latest events
- **WHEN** the event ledger is collapsed
- **THEN** the most recent 2-3 recorded events remain visible in a peek strip

#### Scenario: Expanding the ledger reveals full history
- **WHEN** an operator expands a collapsed ledger
- **THEN** the full recorded event history for the match becomes visible

#### Scenario: Category filter buttons display localized labels
- **WHEN** an operator views the event ledger filter controls in any supported language
- **THEN** each category button (`all`, `positive`, `negative`, `neutral`) SHALL display a localized
  label (e.g. in Spanish: "Todos", "Positivos", "Negativos", "Neutros") rather than raw English
  identifiers.

### Requirement: Person-payload-field prompts render a localized label

A person-payload-field prompt in the event-recording controls SHALL render the localized label the
discipline descriptor declares beside the event definition, for the console's active language,
however the discipline declared that field. The underlying JSON Schema key SHALL NOT be rendered in
place of a declared label. Where no label is declared, the console SHALL render the field's key
rather than a label derived from it.

#### Scenario: A secondary field renders its localized label

- **WHEN** the console renders a secondary-field chip for an event definition whose discipline
  declares a label for that field
- **THEN** the chip shows that label, resolved for the console's active language, not the field's
  underlying key

#### Scenario: A field declared through an effect is labelled like any other

- **WHEN** the prompted field reaches the console through a statistic or tag effect's payload-field
  target rather than through the definition's person-payload-field list
- **THEN** it renders its declared label exactly as a person-payload-field entry does

#### Scenario: The same event definition renders correctly in every supported language

- **WHEN** the console's active language changes
- **THEN** every person-payload-field chip's label updates to that language's resolved value, with no
  language showing the raw field key

#### Scenario: An undeclared label shows the key rather than an invented one

- **WHEN** the active discipline declares a prompted secondary field but no label for it
- **THEN** the chip shows the field's key, and no label is derived from that key

#### Scenario: Which prompts these are

- **WHEN** an event asks for a secondary actor
- **THEN** such as an assist provider or a substitution's outgoing player, it is a
  person-payload-field prompt

#### Scenario: Every way a field can be declared

- **WHEN** a discipline declares a prompted field as a `personPayloadFields` entry, a statistic
  effect's payload-field target, or a tag effect's payload-field target
- **THEN** its declared label is rendered all the same

#### Scenario: Labels ship with the discipline

- **WHEN** a discipline names its own fields
- **THEN** no frontend release is needed

#### Scenario: Why a key beats a derived label

- **WHEN** no label is declared
- **THEN** the key is shown, because a generated label is indistinguishable from a translated one
  that no language approved

### Requirement: The match-control API refuses to operate a match with an undecided side

The match-control API SHALL refuse to start a match, record an event in it, or record its result while
any of its sides is undecided, naming the undecided side's source. This is a record-integrity refusal:
an event or result would name an entrant that is not playing.

#### Scenario: Starting an undecided final is refused

- **WHEN** an operator attempts to start a final whose sides are "winner of semi-final 1" and "winner of
  semi-final 2", and semi-final 2 is undecided
- **THEN** the request is refused, naming "winner of semi-final 2" as undecided, and nothing changes

#### Scenario: Recording a result for an undecided match is refused

- **WHEN** a result is submitted for a match with an undecided side, through the console or bulk load
- **THEN** it is refused, naming the undecided side, and no result is recorded

Any future outcome endpoint, including a dedicated forfeit endpoint or CSV result importer, SHALL
apply this same guard before writing. The current CSV participant importer is outside this scope.

### Requirement: The console shows a match awaiting its entrants

When the console opens a match with an undecided side, it SHALL state, in text, which source the match
is awaiting, and SHALL offer no start, event or result control until every side is decided.

#### Scenario: The console states what the match is waiting for

- **WHEN** an operator opens the console of a final whose second semi-final is undecided
- **THEN** the console reads that the final is awaiting the winner of semi-final 2, and shows no start,
  event or result control

#### Scenario: Controls appear once the sides are decided

- **WHEN** the awaited semi-final is decided while the console is open
- **THEN** after the console's projection refreshes, the final shows both entrants and its normal
  controls

### Requirement: The console shows connection state and per-event sync state

The live match console SHALL show a sticky header status: online or offline, the number of queued
actions, and the last successful sync time. The status SHALL be amber while actions are queued, and red
only when an action is refused. Every recorded event SHALL show Queued, Sent, Confirmed or Refused,
derived from the offline queue and server acknowledgement. Confirmed SHALL NOT be shown without that
acknowledgement.

#### Scenario: Goal recorded while offline

- **WHEN** an operator records a goal with no connection
- **THEN** the event shows "Queued", the header reads offline with "1 queued" in amber, and nothing
  shows "Confirmed"

#### Scenario: Connection returns and the server refuses one action

- **WHEN** the queue drains and the server refuses a substitution
- **THEN** that event shows "Refused" with the server's reason in an alert, the header turns red, and
  the other drained events show "Confirmed" once acknowledged
