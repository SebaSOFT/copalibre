## MODIFIED Requirements

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
