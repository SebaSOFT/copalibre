# roles-permissions Specification

## Purpose

Establishes an organization-scoped role taxonomy and an enforced resource-ownership policy so that
authenticated access is never broader than the acting identity's actual role and, for participants,
never broader than their own records.

## Requirements

### Requirement: Organization-scoped role taxonomy
The system SHALL support assigning each user one of `admin`, `referee`, `broadcaster`, or `viewer`
within a given organization, and a user's role in one organization SHALL NOT grant access in another
organization.

#### Scenario: Role does not cross organizations
- **WHEN** a user holds the `admin` role in organization A
- **AND** that user has no role in organization B
- **THEN** the user cannot perform admin actions in organization B

### Requirement: Organization bootstrap is super-admin controlled
Only an installation-scoped `super-admin` identity SHALL create an organization. That identity
SHALL NOT receive an organization role implicitly. Until an organization has an accepted role
assignment, its first accepted invitation SHALL be assigned `admin`; a non-admin first assignment
is rejected.

#### Scenario: First organization assignment must be admin
- **WHEN** a super-admin creates an organization and creates its first invitation with `viewer`
- **THEN** the system rejects the invitation before sending it

#### Scenario: Super-admin is not silently an organization admin
- **WHEN** a super-admin creates an organization
- **THEN** that identity cannot use organization admin endpoints unless it later receives an active
  `admin` assignment in that organization

### Requirement: Invite flow provisions role and status
An authorized admin SHALL be able to invite a new user by email with a selected role and an initial
active/inactive status, without requiring a SebaSOFT-hosted account.

#### Scenario: Invited user receives the selected role
- **WHEN** an admin invites a user with the `referee` role and `active` status
- **THEN** the invited user, once accepted, holds exactly the `referee` role with `active` status in that organization

### Requirement: Invitations use verified recipient identity
The system SHALL deliver an invitation through the durable outbox and configured SMTP adapter using
a single-use, expiring opaque token. Only its hash SHALL be persisted. Acceptance SHALL require the
recipient's authenticated OIDC identity to present a verified email matching the invitation.

#### Scenario: Another authenticated user cannot claim an invitation
- **WHEN** an authenticated user presents a valid invitation token but their verified email differs
  from the invited recipient
- **THEN** the system rejects acceptance and leaves the invitation usable by its intended recipient

### Requirement: Resource-ownership policy for participant scope
A participant-scoped identity's authorized scope SHALL be limited to its own registration, team
memberships, and reported results, and SHALL NOT extend to another participant's records or to any
operator/admin tool. A roster is match-scoped and does not grant participant ownership by itself.

#### Scenario: Participant cannot read another participant's private data
- **WHEN** a participant-scoped token requests another participant's registration details
- **THEN** the request is rejected with an authorization error

#### Scenario: Participant cannot access operator tools
- **WHEN** a participant-scoped token requests an operator-only endpoint (e.g. match finalization)
- **THEN** the request is rejected with an authorization error, regardless of tournament membership

### Requirement: Role changes are audited
Every role assignment, change, or revocation SHALL be recorded as an auditable event with actor,
timestamp, prior role, and resulting role.

#### Scenario: Role change is traceable
- **WHEN** an admin changes a user's role from `viewer` to `referee`
- **THEN** an audit record exists showing the actor, timestamp, prior role, and resulting role

### Requirement: Inactive users cannot authenticate into the organization
A user set to `inactive` status within an organization SHALL NOT be able to perform any authenticated
action scoped to that organization.

#### Scenario: Deactivated user is blocked
- **WHEN** an admin sets a user's status to `inactive`
- **THEN** subsequent requests using that user's identity for that organization are rejected
