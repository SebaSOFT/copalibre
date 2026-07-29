## Purpose

Lets organizers review, approve, deny, and check in tournament registrations individually or in
bulk, and locks eligibility edits once check-in closes.

## ADDED Requirements

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
Expanding a registration row SHALL reveal contact information, roster/team detail, and prior
experience without navigating to a separate page.

#### Scenario: Expanding a row reveals detail
- **WHEN** an organizer expands a registration row
- **THEN** contact email, team/roster, and available message/revoke actions are shown inline

### Requirement: Eligibility is locked after check-in closes
Once an entrant has checked in and the tournament's check-in window has closed, the registration
review screen SHALL block further roster/eligibility edits for that entrant.

#### Scenario: Roster edit blocked after check-in closes
- **WHEN** an entrant is checked in and the check-in window has closed
- **THEN** attempting to edit that entrant's roster is rejected with an explanation that eligibility is locked

#### Scenario: Roster edit allowed before check-in closes
- **WHEN** the check-in window is still open
- **THEN** an organizer can still edit that entrant's roster

### Requirement: Registration list is scoped to its tournament
The registration review screen SHALL only display registrations belonging to the tournament being
reviewed.

#### Scenario: Cross-tournament isolation
- **WHEN** an organizer opens registration review for tournament A
- **THEN** no registration belonging to tournament B appears in the list
