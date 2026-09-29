# control-web/club-portal Specification

## Purpose
TBD - created by archiving change 0301-club-admin-person-management-and-roster-submission. Update Purpose after archive.

## Requirements

### Requirement: Club-scoped member directory management
The system SHALL provide a Club Portal member directory (`/control/:organizationAlias/clubs/:clubId/portal/members`)
allowing a `club-admin` holding the `org.manage-club-members` capability, scoped to `:clubId`, to view,
create, and update person records affiliated with that club.

#### Scenario: Club admin creates a new member
- **WHEN** a club administrator creates a new person profile specifying display name and, optionally,
  alias and birth date, from their Club Portal
- **THEN** the person record is created in the organization with `club_id` set to the administrator's
  club
- **AND** the action is recorded in the audit ledger

#### Scenario: Cross-club isolation enforcement
- **WHEN** a club administrator scoped to one club attempts to view or update a member, team, or
  roster belonging to a different club
- **THEN** the request is refused with a 403 Forbidden error

### Requirement: Autonomous tournament squad roster submission
The system SHALL provide a Club Portal roster workflow allowing a `club-admin` to select or create a
club team, assemble its squad from the club's own members, and submit it as a tournament registration
for organizer review.

#### Scenario: Assembling and submitting a tournament squad
- **WHEN** a club administrator selects or creates their club's team for a tournament and assembles a
  roster of the club's own members with jersey numbers and squad roles (player, substitute, coach,
  staff)
- **THEN** the submission registers the team as a `pending` tournament entrant with the assembled
  roster applied
- **AND** the registration is visible to tournament administrators through the existing
  registration-review interface, unchanged

#### Scenario: A club admin cannot assemble a squad from another club's members
- **WHEN** a club administrator attempts to add a person whose `club_id` does not match their own
  scoped club to a roster submission
- **THEN** the request is refused with a 403 Forbidden error
