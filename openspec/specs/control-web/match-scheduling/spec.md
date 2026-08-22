# control-web/match-scheduling Specification

## Purpose
Gives an authorized organizer a way to assign venues, officials, and times to a stage's fixtures, and to
manage the venues and officials that assignment draws from — the operator-facing surface for the
already-accepted `tournament-engine/resource-scheduling` backend capability.

## Requirements

### Requirement: A schedule builder assigns venue, time, and officials to a stage's fixtures

The control panel SHALL provide a schedule-builder screen, scoped to one stage, offering both a calendar
view and a list view over that stage's fixtures. An organizer SHALL be able to assign a fixture a start
time, duration, venue, and officials by hand. The builder SHALL preview the assignment batch — showing
every conflict and every already-published fixture the batch would affect — before anything is
published, and SHALL publish only on an explicit action, atomically, exactly as the underlying schedule
API already guarantees.

#### Scenario: An organizer assigns a fixture a time and venue
- **WHEN** an organizer sets a fixture's start time, duration, and venue in the schedule builder
- **THEN** the assignment appears in both the calendar and list views before anything is published

#### Scenario: A conflicting assignment is shown before publish
- **WHEN** an organizer's proposed batch would double-book a venue, double-book an official, or violate a
  configured rest rule
- **THEN** the builder shows the conflict, naming the fixtures involved, before the organizer can publish

#### Scenario: Publishing is explicit and atomic
- **WHEN** an organizer publishes a batch of assignments
- **THEN** every assignment in the batch takes effect together, or none do, matching the underlying
  schedule API's own all-or-nothing guarantee

#### Scenario: Rescheduling a finalized match is refused
- **WHEN** an organizer attempts to change the schedule of a fixture whose match has already concluded
- **THEN** the builder refuses the change and directs the organizer to the audited correction workflow,
  matching the schedule API's own mutation-classification enforcement

### Requirement: The list view states an unscheduled entrant's absence explicitly

For the date range the list view is showing, an entrant with no fixture assigned SHALL be shown with an
explicit indication that they have no scheduled match in that range, rather than being silently omitted
from the list.

#### Scenario: An entrant with nothing scheduled is shown, not omitted
- **WHEN** an entrant has no fixture assigned within the list view's visible date range
- **THEN** that entrant still appears in the list, marked as having no match scheduled in that range

#### Scenario: A scheduled entrant shows their assignment, not the absence marker
- **WHEN** an entrant has a fixture assigned within the visible date range
- **THEN** the list view shows that assignment's time and venue, not an absence marker

### Requirement: Venues and officials are managed from a control-panel screen

The control panel SHALL provide a screen listing an organization's venues and officials, and allowing an
authorized organizer to create one, with the fields the underlying API accepts (a venue's alias, name,
capacity, and optional details; an official's display name and roles).

#### Scenario: Listing and creating a venue
- **WHEN** an authorized organizer opens the venue/official management screen
- **THEN** the organization's existing venues and officials are listed, and a new venue can be created
  with a name, capacity, and optional details

#### Scenario: Listing and creating an official
- **WHEN** an authorized organizer creates a new official
- **THEN** the official is stored with their display name and declared roles, and appears in the list
  thereafter

#### Scenario: A venue or official is available to the schedule builder immediately
- **WHEN** a venue or official is created from the management screen
- **THEN** it is available for assignment in the schedule builder without any further step
