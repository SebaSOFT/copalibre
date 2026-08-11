# registration-review Specification

## Purpose
Lets organizers review, approve, deny, and check in tournament registrations individually or in
bulk, and locks eligibility edits once check-in closes.
## Requirements
### Requirement: Registrations are filterable by status
The registration review screen SHALL let an organizer filter the registrations table by status
(All, Pending, Accepted, Refused).

#### Scenario: Filtering to pending registrations
- **WHEN** an organizer selects the "Pending" filter
- **THEN** only registrations with pending status are shown in the table

### Requirement: Bulk approve/deny applies to selected registrations only
Selecting multiple registrations via row checkboxes and choosing a bulk action SHALL apply that
action only to the selected rows, and SHALL produce one audit entry per affected registration.

#### Scenario: Bulk approve affects only selected rows
- **WHEN** an organizer selects 3 of 10 pending registrations and clicks "Approve"
- **THEN** exactly those 3 registrations become accepted, and the other 7 remain unchanged

#### Scenario: Bulk action is individually audited
- **WHEN** a bulk approve action affects 3 registrations
- **THEN** 3 separate audit entries are recorded, each with the acting organizer, timestamp, and affected registration

### Requirement: Registration detail is available without leaving the list
Expanding a registration row SHALL reveal contact information, team and team-membership detail, and
prior experience without navigating to a separate page. It SHALL NOT present team membership as a
roster, because a roster belongs to one specific match.

#### Scenario: Expanding a row reveals detail
- **WHEN** an organizer expands a registration row
- **THEN** contact email, team-membership detail, and available message/revoke actions are shown inline

### Requirement: Eligibility is locked after check-in closes
Once an entrant has checked in and the tournament's check-in window has closed, the registration
review screen SHALL block further team-membership and eligibility edits for that entrant. This does
not select or alter a match roster.

#### Scenario: Team-membership edit blocked after check-in closes
- **WHEN** an entrant is checked in and the check-in window has closed
- **THEN** attempting to edit that entrant's team membership is rejected with an explanation that eligibility is locked

#### Scenario: Team-membership edit allowed before check-in closes
- **WHEN** the check-in window is still open
- **THEN** an organizer can still edit that entrant's team membership

### Requirement: Registration list is scoped to its tournament
The registration review screen SHALL only display registrations belonging to the tournament being
reviewed.

#### Scenario: Cross-tournament isolation
- **WHEN** an organizer opens registration review for tournament A
- **THEN** no registration belonging to tournament B appears in the list

### Requirement: A team-membership edit reconciles membership to the submitted set
Submitting a team-membership edit for a `team`-kind entrant SHALL reconcile that team's persistent
membership to exactly the submitted set of people: a person named who does not already hold
membership SHALL be added, a person who currently holds membership but is not named SHALL be
removed, and a person named who already holds membership SHALL be left unchanged. Each addition and
each removal SHALL be recorded as its own audited fact, carrying the prior and resulting state.

#### Scenario: Adding and removing in one edit
- **WHEN** a team currently has three members and an organizer submits a set naming two of them plus
  one new person
- **THEN** the new person is added, the member left out is removed, and the two named members already
  present are untouched

#### Scenario: An empty set clears the team's membership
- **WHEN** an organizer submits an empty set for a team with existing members
- **THEN** every current member is removed and none remain

#### Scenario: Re-submitting the current set changes nothing
- **WHEN** an organizer submits exactly the team's current membership
- **THEN** no addition or removal is recorded

### Requirement: A team-membership edit applies only to a team entrant
A team-membership edit submitted against a `person`-kind entrant SHALL be refused; individual
entrants have no team membership to reconcile.

#### Scenario: Refused against an individual entrant
- **WHEN** a team-membership edit is submitted for an entrant registered as a person, not a team
- **THEN** the request is refused with an explanation, and no membership is written

### Requirement: A team-membership edit names a real person in the organization
A team-membership edit naming a person id that does not resolve to a person in the tournament's
organization SHALL be refused before any membership is written.

#### Scenario: Refused for an unknown person id
- **WHEN** the submitted set names a person id that is not a registered person in this organization
- **THEN** the request is refused, and none of the edit's other additions or removals are applied

### Requirement: A successful team-membership edit reports the resulting membership
The response to a successful team-membership edit SHALL include the team's resulting membership —
each member's identity and display name — so the submitting console can show what was actually
recorded without a separate read.

#### Scenario: Response reflects the edit that was just applied
- **WHEN** a team-membership edit adds one person and removes another
- **THEN** the response's membership list includes the added person, excludes the removed one, and
  includes everyone else who was already a member
