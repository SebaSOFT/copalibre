# control-web/match-scheduling Specification

## Purpose
Gives an authorized organizer a way to assign venues, officials, and times to a stage's fixtures, and to
manage the venues and officials that assignment draws from — the operator-facing surface for the
already-accepted `tournament-engine/resource-scheduling` backend capability.

## Requirements

### Requirement: A schedule builder assigns venue, time, and officials to a stage's fixtures

The control panel SHALL provide a schedule-builder screen, scoped to one stage, showing that stage's
matches alongside the organization's schedules. An organizer SHALL be able to place a match in a slot of
a schedule and assign it officials by hand, reading the slot's venue and time rather than typing them.
The builder SHALL preview the assignment batch — showing every conflict and every already-published match
the batch would affect — before anything is published, and SHALL publish only on an explicit action,
atomically, exactly as the underlying schedule API already guarantees.

#### Scenario: An organizer assigns a fixture a time and venue
- **WHEN** an organizer selects a schedule and places a match in one of its free slots
- **THEN** the match appears in that slot, showing the slot's venue and start time, before anything is
  published

#### Scenario: A conflicting assignment is shown before publish
- **WHEN** an organizer's proposed batch would exceed a venue's capacity, double-book an official, or
  violate a configured rest rule — including against a match of another stage or another tournament
- **THEN** the builder shows the conflict, naming the matches involved, before the organizer can publish

#### Scenario: Publishing is explicit and atomic
- **WHEN** an organizer publishes a batch of assignments
- **THEN** every assignment in the batch takes effect together, or none do, matching the underlying
  schedule API's own all-or-nothing guarantee

#### Scenario: Rescheduling a finalized match is refused
- **WHEN** an organizer attempts to move a match that has already concluded to a different slot
- **THEN** the builder refuses the change and directs the organizer to the audited correction workflow,
  matching the schedule API's own mutation-classification enforcement

#### Scenario: A full slot offers no further placement
- **WHEN** a slot already holds as many matches as its venue's concurrent capacity allows
- **THEN** the builder states that the slot is full rather than accepting a placement the API would refuse

### Requirement: The list view states an unscheduled entrant's absence explicitly

For the date range the list view is showing, an entrant with no match placed in any slot SHALL be shown
with an explicit indication that they have no scheduled match in that range, rather than being silently
omitted from the list.

#### Scenario: An entrant with nothing scheduled is shown, not omitted
- **WHEN** an entrant has no match placed within the list view's visible date range
- **THEN** that entrant still appears in the list, marked as having no match scheduled in that range

#### Scenario: A scheduled entrant shows their assignment, not the absence marker
- **WHEN** an entrant has a match placed within the visible date range
- **THEN** the list view shows that match's slot time and venue, not an absence marker

### Requirement: Venues and officials are managed from a control-panel screen

The control panel SHALL provide a screen listing an organization's venues, officials, and schedules, and
allowing an authorized organizer to create one, with the fields the underlying API accepts (a venue's
alias, name, capacity, and optional details; an official's display name and roles; a schedule's name,
range, slot length, changeover, and venues).

#### Scenario: Listing and creating a venue
- **WHEN** an authorized organizer opens the resource-management screen
- **THEN** the organization's existing venues, officials, and schedules are listed, and a new venue can be
  created with a name, capacity, and optional details

#### Scenario: Listing and creating an official
- **WHEN** an authorized organizer creates a new official
- **THEN** the official is stored with their display name and declared roles, and appears in the list
  thereafter

#### Scenario: Creating a schedule shows the grid it generates
- **WHEN** an authorized organizer creates a schedule with a range, a slot length, a changeover, and one
  or more venues
- **THEN** the resulting slots are shown, so the organizer sees how many they got and at what times before
  scheduling anything into them

#### Scenario: Reshaping an occupied schedule is refused with its reason
- **WHEN** an organizer edits the range, slot length, or changeover of a schedule whose slots hold matches
- **THEN** the screen refuses the edit and states which slots are occupied, matching the API's own refusal

#### Scenario: A venue or official is available to the schedule builder immediately
- **WHEN** a venue, official, or schedule is created from the management screen
- **THEN** it is available in the schedule builder without any further step
