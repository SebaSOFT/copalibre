# resource-scheduling Specification

## Purpose
Assigns venue, official, and time-slot resources to a tournament's generated fixtures, catching
conflicts before publication and guaranteeing a schedule is never seen half-published.

## Requirements

### Requirement: Conflict detection before commit
The system SHALL detect venue double-booking, official double-booking, and configurable rest-rule
violations before a schedule assignment is committed. Venue and time are read from the slot an assignment
names, and officials from the match, so detection evaluates each **match** independently.

#### Scenario: Double-booked venue is rejected
- **WHEN** a match is placed in a slot whose venue is already at its concurrent capacity for that moment
- **THEN** the assignment is rejected with an explicit conflict report naming both matches

#### Scenario: Rest-rule violation is rejected
- **WHEN** an entrant is placed in a slot starting sooner than the configured minimum rest period after
  their previous match
- **THEN** the assignment is rejected with an explicit rest-rule violation report naming both matches

#### Scenario: A venue's changeover is not an entrant's rest
- **WHEN** a schedule declares a changeover shorter than the configured rest rule, and one entrant is
  placed in two consecutive slots
- **THEN** the rest-rule violation is reported, because the changeover governs the venue and the rest rule
  governs the entrant

#### Scenario: Two matches of one fixture are placed independently
- **WHEN** a fixture holds more than one match and each is placed in its own slot
- **THEN** each is evaluated on its own, and two matches of the same fixture in different slots conflict
  with nothing by virtue of sharing a fixture

### Requirement: Downstream-impact preview
Before committing a schedule change, the system SHALL show which already-published matches,
notifications, or public views would be affected by the change.

#### Scenario: Rescheduling a published match shows affected downstream items
- **WHEN** an operator proposes moving a published, unstarted match to a different slot
- **THEN** the system returns a preview listing every already-published match, notification, or public view that references the old time before the change is committed

#### Scenario: The preview names matches, not the fixtures holding them
- **WHEN** a preview is returned for a proposed schedule change
- **THEN** every affected item it lists identifies the match whose placement changes, so a fixture
  holding more than one match is never reported ambiguously

### Requirement: Atomic publication
A schedule or batch of schedule changes SHALL publish in full or not at all; no partially-applied
schedule state SHALL ever be visible on a public surface. Freeing the slots held by matches anulled by an
early series decision SHALL take part in the same atomic publication, so a freed slot and the anulled
match that vacated it never disagree on a public surface.

#### Scenario: A batch publish with one invalid assignment fails entirely
- **WHEN** a batch of schedule assignments is submitted for publication and one assignment fails conflict detection
- **THEN** none of the assignments in that batch are published

#### Scenario: Concurrent publish attempts do not interleave
- **WHEN** two schedule-publish operations targeting overlapping resources are submitted concurrently
- **THEN** at most one succeeds atomically and the other is rejected with a conflict, never producing a mixed result

#### Scenario: An early series decision frees its slots atomically
- **WHEN** a series becomes decided while later matches are placed in published slots
- **THEN** those matches become not-required and their assignments are removed in one atomic publication,
  leaving the slots free and their schedules otherwise untouched, and no public surface shows a freed slot
  still holding a scheduled match

#### Scenario: A failed release leaves the anulling unapplied
- **WHEN** removing an anulled match's assignment fails anywhere in the batch
- **THEN** neither the removal nor the anulling takes effect, and the series' matches remain as they were

### Requirement: Schedule mutation respects mutation classification
Schedule changes SHALL be classified `safe`, `requires_rebuild`, or `blocked_after_results` per the
domain's mutation model, and the system SHALL enforce that classification. Classification is evaluated
against the match being rescheduled, so one concluded match never blocks the rescheduling of another. A
match anulled by a series decision SHALL be treated as concluded for this purpose: its schedule is
history, not a plan. A match in progress SHALL NOT be moved or withdrawn.

#### Scenario: Rescheduling a completed match is blocked
- **WHEN** an operator attempts to move a match that has already concluded to a different slot
- **THEN** the system rejects the change as `blocked_after_results`, directing the operator to the audited correction workflow

#### Scenario: A concluded match does not block an unstarted sibling
- **WHEN** a fixture holds one concluded match and one unstarted match, and the unstarted one is rescheduled
- **THEN** the change is accepted, because classification reads the match being changed rather than the
  fixture holding it

#### Scenario: Rescheduling a not-required match is blocked
- **WHEN** an operator attempts to move a match anulled by a series decision into another slot
- **THEN** the system rejects the change, naming the series result that anulled it

#### Scenario: A match in progress cannot be moved
- **WHEN** an operator attempts to move or withdraw a match whose status is in progress
- **THEN** the batch is refused, naming the match, and nothing changes

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

### Requirement: A venue records operator-entered details for a physical or virtual resource

A venue SHALL accept optional, operator-entered, free-form details describing what kind of resource it
is — physical (for example an address, an operating club, or a playing surface) or virtual (for example
a server address, a region, or a map) — without the system parsing, validating, or acting on their
content. A venue's core identity (alias, name, capacity) SHALL NOT require a `details` value, and a
venue with none SHALL behave exactly as one already does today.

#### Scenario: A physical venue records address and surface details
- **WHEN** a venue is created or edited with detail entries describing its address and playing surface
- **THEN** those details are stored and returned exactly as entered, with no validation of their content

#### Scenario: A virtual venue records connection details
- **WHEN** a venue representing a game server is created with detail entries for its address, region, and
  current map
- **THEN** those details are stored and returned exactly as entered, and the venue functions identically
  to a physical one for scheduling, conflict detection, and capacity purposes

#### Scenario: A venue with no details is unaffected
- **WHEN** a venue is created or edited with no detail entries
- **THEN** it behaves exactly as it did before this requirement existed

### Requirement: Venues and officials are reachable through the API

An organization's venues, officials, and schedules SHALL be creatable and listable through the API, not
only through direct data-store access. This is what an operator-facing resource-management surface, and
the schedule builder that assigns them, depend on.

#### Scenario: An organizer creates a venue through the API
- **WHEN** an authorized organizer submits a new venue's alias, name, capacity, and optional details
- **THEN** the venue is stored and included in the organization's venue list thereafter

#### Scenario: An organizer creates an official through the API
- **WHEN** an authorized organizer submits a new official's display name and roles
- **THEN** the official is stored and included in the organization's official list thereafter

#### Scenario: An organizer creates a schedule through the API
- **WHEN** an authorized organizer submits a schedule's name, range, slot length, changeover, and venues
- **THEN** the schedule is stored with its generated slots and included in the organization's schedule
  list thereafter

#### Scenario: Listing venues and officials requires no prior knowledge of their ids
- **WHEN** an authorized organizer requests an organization's venues or officials
- **THEN** every one already created for that organization is returned, without the caller needing to
  already know any of their ids

### Requirement: An assignment places a match in a slot
A schedule assignment SHALL identify the match it applies to and the slot that match is played in, and
nothing else. Venue, start and duration SHALL be read from the slot, and the fixture from the match, so a
caller states a placement rather than restating facts the slot and the match already hold.

#### Scenario: An assignment names a match and a slot
- **WHEN** a schedule assignment is submitted
- **THEN** it carries a match identifier and a slot identifier, and carries no venue and no time window
  of its own

#### Scenario: The read side still reports venue, time and fixture
- **WHEN** an assignment is read back
- **THEN** it reports the match, its fixture, the slot, the slot's venue, and the window the slot covers,
  resolved rather than stored on the assignment

#### Scenario: A fixture may hold more than one scheduled match
- **WHEN** a fixture holds more than one match and each is placed in its own slot
- **THEN** all of them are stored, and reading the fixture's schedule returns every one of them

### Requirement: Officials are assigned to the match they officiate
Officials SHALL be assigned to a match, not to the slot or schedule the match is played in. A slot
holding more than one match SHALL be able to state a different set of officials for each.

#### Scenario: Two matches in one slot carry different officials
- **WHEN** a venue with capacity for two hosts two matches in one slot, each with its own referee
- **THEN** each match reports its own official, and neither reports the other's

#### Scenario: A match's officials survive its rescheduling
- **WHEN** a match is moved from one slot to another
- **THEN** the officials assigned to it are unchanged, because they were never a property of the slot

### Requirement: Conflict detection covers the whole organization
Conflict detection SHALL evaluate every match scheduled anywhere in the organization, not only those of
the stage being scheduled. A venue over capacity, an official in two places, or an entrant denied their
rest SHALL be detected whether the two matches belong to one stage, two stages, or two tournaments.

#### Scenario: A clash across two stages is detected
- **WHEN** a match of one stage is placed at a venue and moment already at capacity because of a match of
  a different stage
- **THEN** the assignment is rejected, naming both matches

#### Scenario: A clash across two tournaments is detected
- **WHEN** an official is already assigned to a match of another tournament in an overlapping slot
- **THEN** the assignment is rejected as an official conflict naming both matches

### Requirement: An unpublished assignment never reaches a public surface
An assignment that has not been published SHALL NOT appear on any public or broadcast surface, including
as a date on a tournament overview. Publication is a fact of the assignment, not of the slot or the
schedule, and reading the assignment store directly SHALL NOT bypass it.

#### Scenario: An unpublished assignment shows no date publicly
- **WHEN** a match has an assignment that has not been published, and a spectator views the tournament
  overview
- **THEN** the match is shown with no scheduled time, exactly as if none had been assigned

#### Scenario: Publishing makes the date public
- **WHEN** that same assignment is published
- **THEN** the tournament overview shows its date

#### Scenario: An occupied slot is not itself public
- **WHEN** a slot holds one published and one unpublished assignment
- **THEN** the public surface shows the published match only, and the slot's existence discloses nothing
  about the other

### Requirement: A schedule is the only source of when a match is played
The scheduled time of a match SHALL be read from its assignment's slot and from nowhere else. No second
stored value SHALL carry a match's or a fixture's playing time, so two surfaces can never report
different dates for one match.

#### Scenario: Every surface reads one source
- **WHEN** two public surfaces report the scheduled time of the same match
- **THEN** both report the same value, because both read the assignment's slot

#### Scenario: A match with no assignment has no scheduled time
- **WHEN** a match has been generated but never placed in a slot
- **THEN** every surface reports it as having no scheduled time, rather than one surface reporting a time
  from another store

### Requirement: Resources management UI layout and owned controls
The resources management screen SHALL compose owned design-system primitives without raw form tags and SHALL provide clear layout spacing between adjacent action buttons.

#### Scenario: Schedule row actions have clear visual separation
- **WHEN** an operator views the list of generated schedules
- **THEN** adjacent action buttons (e.g. edit and delete) are separated with design token spacing rather than rendered in an unstyled block with zero gap

#### Scenario: Selection controls use owned primitives
- **WHEN** an operator selects venues for a schedule or assigns roles to an official
- **THEN** all options are rendered using owned Checkbox primitives with visible focus states and accessible labels

### Requirement: A tournament declares its minimum rest between an entrant's matches

A tournament SHALL be able to declare an optional minimum rest, in minutes, between the end of one of an
entrant's matches and the start of their next. Conflict detection SHALL read it from the tournament
rather than from the request. A tournament declaring none SHALL apply no rest rule. Changing it SHALL be
classified `safe`, and SHALL move no placement.

#### Scenario: The stored rule is applied

- **WHEN** a tournament declares a 120-minute minimum rest and an entrant is placed 90 minutes after
  their previous match ends
- **THEN** the batch is rejected with a rest-rule conflict naming both matches

#### Scenario: No declared rule, no rest conflict

- **WHEN** a tournament declares no minimum rest and an entrant is placed in back-to-back slots
- **THEN** no rest-rule conflict is reported

#### Scenario: A rule sent in the request is ignored

- **WHEN** a preview or publish request still carries a rest rule in its body
- **THEN** the tournament's stored rule is applied instead, and the response is otherwise unchanged

### Requirement: A placed match occupies its estimated duration

A placed match SHALL occupy, for conflict detection, its slot's start plus its estimated duration: the
regulation length of its discipline's timed segments, with the tournament ruleset's overrides applied.
When no estimate exists, it SHALL occupy its slot's length. A venue SHALL additionally be held for the
schedule's changeover after the match.

#### Scenario: Short slots do not hide a venue clash

- **WHEN** a schedule has 15-minute slots, the discipline's regulation is two 25-minute halves, and two
  matches are placed at one single-capacity venue 15 minutes apart
- **THEN** the second placement is rejected as a venue conflict, because the first match occupies 50
  minutes

#### Scenario: Rest is measured from the match's end

- **WHEN** an entrant's first match starts at 09:00 with a 50-minute estimate, the minimum rest is 60
  minutes, and their next match is placed at 10:30
- **THEN** a rest-rule conflict is reported, because only 40 minutes separate the estimated end from the
  next start

#### Scenario: An untimed discipline falls back to the slot

- **WHEN** a match of a discipline played to sets, with no timed segment, is placed in a 120-minute slot
- **THEN** it occupies 120 minutes for conflict detection

### Requirement: A match can be withdrawn from its slot

A schedule batch SHALL be able to withdraw a match from its slot, atomically with the batch's other
placements. A withdrawn match SHALL have no scheduled time on any surface. Withdrawing a concluded,
not-required or in-progress match SHALL be refused.

#### Scenario: A withdrawal publishes with the batch

- **WHEN** a batch withdraws one match and places another in the slot it freed
- **THEN** both take effect together, and the withdrawn match reports no scheduled time

#### Scenario: Withdrawing a finalized match is refused

- **WHEN** a batch tries to withdraw a finalized match
- **THEN** the whole batch is refused as `blocked_after_results`

### Requirement: A change to a published placement keeps its history and reason

Changing or withdrawing a published placement SHALL require a reason: the batch's reason, or that
match's own exception reason when given. It SHALL record, in the same transaction, the prior placement
(slot, venue, start and officials) with actor, time, the reason that applies and resulting state, in an
append-only history and in the audit trail. A first placement SHALL need no reason.

#### Scenario: Moving a published match records where it was

- **WHEN** a published match is moved from 14:30 at Court 1 to 18:00 at Court 2 with the reason
  "venue unavailable"
- **THEN** the history holds the 14:30 Court 1 placement, the actor, the time and the reason, and the
  audit record carries the prior and resulting placement

#### Scenario: A published change without a reason is refused

- **WHEN** a batch moves a published match and supplies no reason
- **THEN** the batch is refused, naming the published matches that need a reason, and nothing changes

#### Scenario: An exception reason overrides the batch reason for its match

- **WHEN** a batch moves three published matches with the batch reason "Court 1 without lights" and one of
  them carries its own reason "requested by the visiting club"
- **THEN** two history rows record "Court 1 without lights" and the third records "requested by the
  visiting club"

#### Scenario: Exceptions alone can cover the batch

- **WHEN** every changed published match in a batch carries its own reason and the batch reason is empty
- **THEN** the batch is accepted

#### Scenario: A preset reason is stored with its code

- **WHEN** a reason is chosen from the preset list rather than typed
- **THEN** the history stores the preset's code along with its text, so it can be rendered in any of the
  eight languages

#### Scenario: A first placement needs no reason

- **WHEN** an unplaced match is placed and published
- **THEN** no reason is required and no history row is written

### Requirement: An organization's schedule is readable across tournaments

An authorized principal SHALL be able to read an organization's assignments over a time range, across
its tournaments, optionally filtered by tournament, stage or venue. Each assignment SHALL report its
match, tournament, stage, zone, round, entrants, venue, start, estimated end and whether it is published.

#### Scenario: Two tournaments sharing a venue are read together

- **WHEN** an organizer reads the organization's schedule for a weekend in which two tournaments use the
  same venue
- **THEN** both tournaments' assignments are returned with their tournament and estimated end

#### Scenario: Unauthorized reads are refused

- **WHEN** a principal without schedule authority in the organization requests its schedule
- **THEN** the request is refused

### Requirement: An undecided match is schedulable

A match with one or both sides undecided SHALL be placed in a slot, assigned officials, previewed and
published exactly like a decided match, with the venue-capacity and official conflict checks applied.
At placement, the rest rule SHALL be evaluated only for the entrants the match already has.

#### Scenario: A final with no entrants is published in its slot

- **WHEN** an organizer places a final whose two sides are undecided in a slot and publishes the batch
- **THEN** the assignment is published, and reading it back reports the final's slot, venue and window

#### Scenario: Venue capacity still applies

- **WHEN** an undecided match is placed in a slot whose venue is already at capacity
- **THEN** the assignment is rejected as a venue conflict naming both matches

#### Scenario: The rest rule ignores an undecided side

- **WHEN** a semi-final with one decided and one undecided side is placed shortly after the decided
  entrant's previous match
- **THEN** the rest rule is evaluated for the decided entrant only, and the undecided side produces no
  conflict

### Requirement: Resolved scheduling identities

The existing stage fixtures response SHALL include known entrants' display names and persisted
abbreviations for teams and individual participants. Scheduling SHALL render known names through
the shared EntrantName atom, inheriting typography from each consumer. Entrant IDs SHALL remain
wire identities and SHALL NOT be substituted for missing display names in visible or accessible text.

#### Scenario: Known entrants in a bracket schedule

- **WHEN** an organizer reads a schedule with known entrants and undecided future fixtures
- **THEN** known sides and day-off entries show their names through the shared atom
- **AND** accessible controls and concurrent-change notices identify matches by names rather than UUIDs

#### Scenario: Missing identity

- **WHEN** a fixture side has no resolved display name
- **THEN** scheduling shows the localized undecided fallback and never the opaque entrant ID

### Requirement: A published schedule reports its current conflicts

Reading a stage's schedule SHALL return the conflicts that exist among published assignments at that
moment: venue over capacity, official double-booked, and rest-rule violations. It SHALL use the same
detection that preview and publish use. A conflict that arose after publication SHALL be reported
without moving, unpublishing or refusing any assignment.

#### Scenario: A rest conflict appears when a side resolves

- **WHEN** a semi-final side resolves to an entrant whose quarter-final finished sooner than the
  configured rest period before the semi-final's slot
- **THEN** the schedule read reports a rest-rule conflict naming both matches, and both placements are
  unchanged

#### Scenario: A clean schedule reports nothing

- **WHEN** every published assignment satisfies venue capacity, official availability and rest
- **THEN** the schedule read reports no conflicts

#### Scenario: Republishing a fix clears the conflict

- **WHEN** the organizer moves the semi-final to a later slot through an ordinary preview and publish
- **THEN** the schedule read no longer reports that conflict

### Requirement: A conflict arising from resolution is announced

When a resolution or a qualification confirmation makes a new conflict real among published
assignments, the system SHALL emit one outbox event naming the conflict and the matches involved, in the
same transaction as the resolution.

#### Scenario: The control panel is told

- **WHEN** a finalized quarter-final makes a rest conflict real for its semi-final
- **THEN** an outbox event naming the rest conflict and both matches is published in the same transaction
