# live-match-operations Specification

## Purpose
Lets an authorized official record what actually happened in a match — events, segments, timers —
through a discipline-configured, capability-scoped interface, producing the auditable operational
facts the engine calculates results from.

## Requirements

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

### Requirement: Substitution events update on-field active lineup state

The match operations system SHALL maintain active on-field participation state for match roster members, updating `onField` status dynamically upon recording substitution events and restricting goalkeeper auto-targeting to active on-field goalkeepers.

#### Scenario: Recording a substitution swaps active on-field status
- **WHEN** a `substitution` event is recorded with `playerOutId` and `playerInId`
- **THEN** the match state marks `playerOutId` as `onField: false` and `playerInId` as `onField: true`

#### Scenario: Auto-targeting goalkeeper selects active on-field goalkeeper
- **WHEN** a `goal` event is recorded against a team with multiple goalkeepers on the roster
- **THEN** the system auto-selects the goalkeeper who currently has `onField: true`, ignoring bench substitute goalkeepers, and writes their id into `payload.goalkeeperId`

#### Scenario: A substitution changes which goalkeeper subsequent goals attribute to
- **WHEN** a goalkeeper substitution is recorded mid-match, then a further goal is conceded
- **THEN** the recorded goal's `payload.goalkeeperId` names the newly on-field goalkeeper, not the one who was substituted off

### Requirement: A match roster is an authorized, audited, revisable write per entrant

The system SHALL provide an authorized write that records one entrant's roster for one match, as an
ordered set of members. The write SHALL be authorized by the `match.select-roster` capability, SHALL
replace any prior selection for that same match and entrant rather than accumulating, and SHALL be
audited on every write with its prior and resulting state. A member's display name and nationality
SHALL be snapshotted at selection time rather than resolved on read.

#### Scenario: Selecting a roster for one side
- **WHEN** a subject holding `match.select-roster` submits a roster for one entrant of a match
- **THEN** the roster is stored for that match and entrant, and an audit entry records the write

#### Scenario: Revising a roster replaces the prior selection
- **WHEN** a roster is submitted a second time for the same match and entrant
- **THEN** the stored roster is the second submission, not the union of both, and both writes are audited

#### Scenario: An unauthorized subject is refused
- **WHEN** a subject without `match.select-roster` submits a roster
- **THEN** the write is refused

#### Scenario: A person who is not registered to the entrant is refused
- **WHEN** a submitted member names a person who is not a registered player of the team behind that
  entrant
- **THEN** the write is refused, naming the person

#### Scenario: An entrant not playing this match is refused
- **WHEN** a roster is submitted for an entrant that is not one of the match fixture's two sides
- **THEN** the write is refused

#### Scenario: Duplicate members or numbers within one side are refused
- **WHEN** a submitted roster repeats a person, or assigns the same shirt number to two members of the
  same side
- **THEN** the write is refused

#### Scenario: A roster short of what a sport conventionally requires is accepted
- **WHEN** a submitted roster has fewer members, or no member holding a role, than the discipline's
  declared roster constraints describe
- **THEN** the write is accepted, because the platform enforces only record integrity and what this
  organizer configured, never what a sport usually requires

#### Scenario: A member carries its match details

- **WHEN** a member is recorded
- **THEN** it carries the person, a shirt number, the roster roles the discipline declares, and a
  starter-or-bench on-field state

#### Scenario: A later change to the person leaves a played roster alone

- **WHEN** a rostered person's display name or nationality changes after selection
- **THEN** the match roster keeps the values snapshotted when it was selected

### Requirement: Recorded-event person eligibility derives from the selected roster

An event whose definition declares a person actor requirement SHALL be accepted only when the named
person appears on the selected roster of a side of that match, and SHALL be refused otherwise.

#### Scenario: An event attributed to a rostered player is recorded
- **WHEN** an event requiring a person actor names a person on the match's selected roster
- **THEN** the event is recorded with that attribution

#### Scenario: An event attributed to a player absent from the roster is refused
- **WHEN** an event requiring a person actor names a person absent from both sides' selected rosters
- **THEN** the event is refused

#### Scenario: Removing an attributed member is refused
- **WHEN** a roster revision would remove a person to whom an already-recorded event in that match is
  attributed
- **THEN** the revision is refused, naming the recorded event

#### Scenario: Adding a member during a match is permitted
- **WHEN** a roster revision adds a member while the match is in progress
- **THEN** the revision is accepted

### Requirement: A match's roster, events, and result may be submitted as one batch

The system SHALL accept a single submission carrying a match's full roster, its ordered event list
(each with an organizer-supplied `occurredAt`), and its final result, applying the identical
per-event validation (`EventDefinition.payloadSchema`, `actorRequirement`, `permittedSegmentTypes`)
and the identical once-only-finalization rule that already govern events and results recorded live.
The submission SHALL commit entirely or not at all.

#### Scenario: A complete, valid batch commits as one match
- **WHEN** an authorized subject submits a batch carrying a valid roster, a sequence of events each
  legal for the discipline, and a result
- **THEN** the match's roster, every event in submitted order, and the result are all persisted, and
  the match reads as `finalized`, indistinguishable in shape from a live-recorded match

#### Scenario: An invalid event anywhere in the batch aborts the whole submission
- **WHEN** a submitted batch's tenth event references an `EventDefinition` code the discipline does not
  declare, or fails its `payloadSchema`
- **THEN** the entire submission is rejected, identifying which entry failed, and nothing from the
  batch — not the roster, not the nine valid events before it — is persisted

#### Scenario: A batch submission is subject to the same authorization as live recording
- **WHEN** a subject with no `match.record-event`/`match.finalize` capability for the match attempts a
  batch submission
- **THEN** it is refused, the same way an individual live command would be refused for the same subject

#### Scenario: A batch cannot finalize a match that already has a result
- **WHEN** a batch submission targets a match that already carries a recorded result
- **THEN** it is refused, directing the caller to the audited correction workflow, the same refusal a
  second live finalization attempt already produces

#### Scenario: Event timestamps in a batch are historical, not constrained to the present
- **WHEN** a batch submission's events carry `occurredAt` values from a date in the past, matching when
  the match was actually played
- **THEN** they are accepted and persisted as given — no recency constraint is applied to a batch
  submission's timestamps that would not already apply to a live one

### Requirement: Supported match-operating authority grant
An authorized organizer SHALL have a supported, API-reachable path to gain match-operating authority
(roster selection, event recording, finalization, bulk-load) for a match within their organization,
without requiring direct database access.

#### Scenario: An org-admin operates a match with no pre-existing assignment
- **WHEN** an organization admin with no prior per-match assignment attempts to record a match result
  through the supported API path
- **THEN** the request SHALL succeed, using either an explicit, grantable assignment or the admin's
  organization-scoped authority, rather than being refused with no path to remedy it

### Requirement: A match is in progress only with a segment set running

A match SHALL enter or resume the in-progress state only when a segment is set running. A Start command for a match with no segments SHALL first create its regulation plan. A Start or Resume command that still has no segment to set running SHALL be refused as a bad-request error. The match's status and segments SHALL stay unchanged after such a refusal.

#### Scenario: Start is refused for a match with no segments

- **WHEN** a Start command arrives for a scheduled match with no segments whose discipline declares no segment type, so no regulation plan exists
- **THEN** the request is refused as a bad-request error, no segment is created and the match stays scheduled

#### Scenario: Start without a named segment starts the first segment not yet ended

- **WHEN** a Start command arrives for a scheduled match whose segments are all pending and names no segment
- **THEN** the first segment not yet ended starts, and the match becomes in progress

#### Scenario: Resume is refused when every segment has ended

- **WHEN** a Resume command arrives for an in-progress match whose segments have all ended
- **THEN** the request is refused as a bad-request error and no segment changes state

### Requirement: Start creates the regulation plan of a match with no segments

A Start command for a scheduled match with no segments SHALL create, in the same transaction, the regulation segments of the ruleset the match is played under, then set the first one running. Regulation SHALL be the discipline's first declared segment type, created once per `regulationCount`, or once per set needed to win a `bestOf`, or once when neither is configured.

#### Scenario: A football match starts with two halves

- **WHEN** an operator starts a scheduled football match with no segments under a ruleset whose regulation count is 2
- **THEN** the match has two half segments, the first is running, the second is pending and the match is in progress

#### Scenario: A best-of-three match starts with two sets

- **WHEN** an operator starts a scheduled tennis match with no segments under a ruleset configured as best of 3
- **THEN** the match has two set segments, and the first is running

#### Scenario: An override changes the plan

- **WHEN** the tournament ruleset overrides the regulation count to 4 and an operator starts a match with no segments
- **THEN** four regulation segments are created

#### Scenario: A match that already has segments keeps them

- **WHEN** an operator starts a scheduled match that already has segments
- **THEN** no segment is created and the first segment not yet ended starts

### Requirement: Concurrent starts create one plan

Two Start commands for the same scheduled match with no segments, arriving together or replayed from an offline queue, SHALL leave exactly one regulation plan. The later command SHALL be answered as a refusal or, when it repeats an idempotency key, with the recorded response.

#### Scenario: Two operators press Start together

- **WHEN** two Start commands with different idempotency keys arrive at the same time for a scheduled match with no segments
- **THEN** one succeeds, the other is refused because the match is already in progress, and the match holds one plan

#### Scenario: An offline start is replayed

- **WHEN** a Start command is replayed with an idempotency key that already succeeded
- **THEN** the recorded response is returned and no segment is created

### Requirement: An operator adds a segment to a match in progress

An authorized operator SHALL be able to append one segment of any type the discipline declares to an in-progress match. The segment SHALL be numbered after the last one, start pending, be audited with its actor, reach every console through the realtime stream, and honor an idempotency key.

#### Scenario: Extra time is added

- **WHEN** an operator adds an extra-time segment to an in-progress football match whose two halves have ended
- **THEN** the match has a third segment of type extra time, pending, and the audit trail names the operator

#### Scenario: A stuck match is repaired

- **WHEN** an operator adds a half to an in-progress match that has no segments, then resumes
- **THEN** the half runs and events can be recorded in it

#### Scenario: A repeated addition creates one segment

- **WHEN** the same add-segment request is sent twice with one idempotency key
- **THEN** one segment is created and both responses are the same

### Requirement: Adding a segment is refused only when the record would be incoherent

Adding a segment SHALL be refused as a bad-request error when the match is not in progress or when the discipline does not declare the type. Adding a regulation segment beyond the configured maximum, or any declared conditional type, SHALL be accepted and reported as outside the plan.

#### Scenario: A finalized match

- **WHEN** an operator adds a segment to a finalized match
- **THEN** the request is refused as a bad-request error and no segment is created

#### Scenario: An undeclared type

- **WHEN** an operator adds a segment of a type the discipline does not declare
- **THEN** the request is refused as a bad-request error and no segment is created

#### Scenario: A fourth set in a best of three

- **WHEN** an operator adds a set to an in-progress best-of-three match that already has three sets
- **THEN** the set is created and the console state reports set additions as outside the plan

### Requirement: A time correction keeps the segment's state

A correction of a segment's elapsed time that does not ask to activate the segment SHALL set the time and SHALL leave the segment's state unchanged: a running segment keeps running from the corrected time, a paused or not started segment stays stopped, and an ended segment stays ended. The correction SHALL be audited with its actor and the prior and resulting time.

#### Scenario: A running half is corrected

- **WHEN** an operator corrects the time of a running half to 20:50
- **THEN** the half reads 20:50 and keeps running, and no other segment changes state

#### Scenario: An ended half is corrected

- **WHEN** an operator corrects the time of an ended half to 45:00
- **THEN** the half reads 45:00 and stays ended

### Requirement: A time correction is refused on a closed match and never reopens an ended segment

A time correction SHALL be refused as a bad-request error when the match is closed: finalized, forfeited or not-required. A time correction that asks to activate a segment SHALL be refused as a bad-request error when that segment has ended. After either refusal the segments' times and states SHALL be unchanged. A time correction on a scheduled or an in-progress match SHALL be accepted.

#### Scenario: A finalized match

- **WHEN** a time correction arrives for a segment of a finalized match
- **THEN** the request is refused as a bad-request error and the segment's time is unchanged

#### Scenario: A forfeited match

- **WHEN** a time correction arrives for a segment of a forfeited match
- **THEN** the request is refused as a bad-request error and the segment's time is unchanged

#### Scenario: An old console asks to activate an ended segment

- **WHEN** a time correction with the request to activate arrives for an ended segment of an in-progress match
- **THEN** the request is refused as a bad-request error and the segment stays ended

#### Scenario: A scheduled match

- **WHEN** a time correction without activation arrives for a segment of a scheduled match
- **THEN** the time is set, the segment stays not started and the match stays scheduled

### Requirement: An ended segment is reopened only by an explicit command with a reason

An authorized operator with the clock-control capability SHALL be able to reopen an ended segment of an in-progress match with a non-empty reason. The segment SHALL return to paused with its time kept, the audit trail SHALL record the reason, actor and prior and resulting state, every console SHALL receive the change through the realtime stream, and a repeated idempotency key SHALL return the recorded response.

#### Scenario: A half ended by mistake

- **WHEN** an operator reopens the first half of an in-progress match with the reason "Ended by mistake"
- **THEN** the half is paused with its time kept, and the audit trail shows the reason and the operator

#### Scenario: A repeated reopen

- **WHEN** the same reopen request is sent twice with one idempotency key
- **THEN** both responses are the same and the audit trail holds one reopen

### Requirement: Reopening is refused when the record would be incoherent

Reopening SHALL be refused as a bad-request error when the reason is empty, when the segment has not ended, or when the match is not in progress. After a refusal the segment's state SHALL be unchanged.

#### Scenario: No reason

- **WHEN** an operator reopens an ended segment with an empty reason
- **THEN** the request is refused as a bad-request error and the segment stays ended

#### Scenario: A finalized match

- **WHEN** an operator reopens an ended segment of a finalized or forfeited match
- **THEN** the request is refused as a bad-request error and the segment stays ended

#### Scenario: A segment that has not ended

- **WHEN** an operator reopens a running or paused segment
- **THEN** the request is refused as a bad-request error and the segment's state is unchanged
