# roles-permissions Specification

## Purpose

Establishes an organization-scoped role taxonomy and an enforced resource-ownership policy so that
authenticated access is never broader than the acting identity's actual role and, for participants,
never broader than their own records.

## Requirements

### Requirement: Organization-scoped role taxonomy
The system SHALL support assigning each user one of `admin`, `club-admin`, `tournament-admin`,
`referee`, `broadcaster`, or `viewer` within a given organization, and a user's role in one
organization SHALL NOT grant access in another organization. `admin` (organization-admin) SHALL hold
that role in exactly one organization at a time — accepting an `admin` assignment in a second
organization does not extend authority from the first, and each organization's admin authority is
independently scoped. A `tournament-admin` assignment SHALL name exactly one tournament within the
organization; the role SHALL NOT be assignable without one.

#### Scenario: Role does not cross organizations
- **WHEN** a user holds the `admin` role in organization A
- **AND** that user has no role in organization B
- **THEN** the user cannot perform admin actions in organization B

#### Scenario: Organization-admin authority does not merge across organizations
- **WHEN** a user holds an active `admin` assignment in organization A and a separate active `admin`
  assignment in organization B
- **THEN** actions taken under the organization A admin authority (e.g. granting a role) apply only to
  organization A, and the two assignments are evaluated, audited, and revocable independently

#### Scenario: club-admin is organization-scoped like every other role
- **WHEN** a user holds the `club-admin` role in organization A
- **AND** that user has no role in organization B
- **THEN** the user cannot perform club-admin actions in organization B

#### Scenario: tournament-admin cannot be assigned without naming a tournament
- **WHEN** an assignment naming the `tournament-admin` role names no tournament
- **THEN** the assignment is refused, naming that a tournament is required

#### Scenario: tournament-admin does not cross tournaments
- **WHEN** a user holds `tournament-admin` for tournament A within an organization
- **THEN** the user has no `tournament-admin` authority over tournament B in the same organization

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
active/inactive status, without requiring a SebaSOFT-hosted account, subject to the role-granting
hierarchy: the inviter MAY only select a role their own authority is permitted to grant.

#### Scenario: Invited user receives the selected role
- **WHEN** an admin invites a user with the `referee` role and `active` status
- **THEN** the invited user, once accepted, holds exactly the `referee` role with `active` status in
  that organization

#### Scenario: Invite offering a role the inviter cannot grant is rejected
- **WHEN** an organization `admin` attempts to invite a user with a role outside what an organization
  `admin` may grant (see the role-granting hierarchy requirement)
- **THEN** the system rejects the invitation before it is created or sent

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
This scope SHALL include submitting a result report or dispute for a match the participant is
entered in, bounded by the same ownership rule as every other participant self-service action — no
new authorization concept, only a new scoped write action.

#### Scenario: Participant cannot read another participant's private data
- **WHEN** a participant-scoped token requests another participant's registration details
- **THEN** the request is rejected with an authorization error

#### Scenario: Participant cannot access operator tools
- **WHEN** a participant-scoped token requests an operator-only endpoint (e.g. match finalization)
- **THEN** the request is rejected with an authorization error, regardless of tournament membership

#### Scenario: Participant can submit a report or dispute for their own match
- **WHEN** a participant-scoped token submits a result report or dispute for a match that participant
  is entered in
- **THEN** the submission is accepted as a candidate input to the existing operator-authorized
  correction workflow, and does not itself change any authoritative result

#### Scenario: Participant cannot submit a report or dispute for another participant's match
- **WHEN** a participant-scoped token submits a result report or dispute for a match that participant
  is not entered in
- **THEN** the request is rejected with an authorization error

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

### Requirement: Role-granting hierarchy
Granting, changing, or revoking a role SHALL be limited by the acting identity's own role, forming a
strict hierarchy: an installation `super-admin` MAY grant `super-admin`, organization `admin`,
`club-admin`, or `referee`; an organization `admin` MAY grant organization `admin`, `club-admin`, or
`referee`, scoped to their own organization only; `club-admin` and `referee` MAY NOT grant, change, or
revoke any role. No identity may grant a role its own authority does not cover, and no identity may
grant a role that exceeds its own authority level.

#### Scenario: super-admin grants an organization-admin role
- **WHEN** an installation super-admin invites a user into an organization with the `admin` role
- **THEN** the invitation is created and, once accepted, the user holds the `admin` role in that
  organization

#### Scenario: organization-admin grants a club-admin role within their own organization
- **WHEN** an organization `admin` invites a user into their own organization with the `club-admin` role
- **THEN** the invitation is created and, once accepted, the user holds the `club-admin` role in that
  organization

#### Scenario: organization-admin cannot grant super-admin
- **WHEN** an organization `admin` attempts to grant the installation `super-admin` role to any user
- **THEN** the system rejects the request with an authorization error

#### Scenario: club-admin cannot invite, change, or remove any user
- **WHEN** a user holding only the `club-admin` role attempts to invite a user, change a role
  assignment, or remove a role assignment
- **THEN** the system rejects the request with an authorization error

#### Scenario: referee cannot invite, change, or remove any user
- **WHEN** a user holding only the `referee` role attempts to invite a user, change a role assignment,
  or remove a role assignment
- **THEN** the system rejects the request with an authorization error

### Requirement: Only a super-admin can create a super-admin
Granting the installation-level `super-admin` role SHALL require the acting identity to already hold
an active `super-admin` role. No organization-scoped role, regardless of level, SHALL be sufficient to
grant `super-admin`.

#### Scenario: super-admin creates another super-admin
- **WHEN** an active super-admin grants the `super-admin` role to another identity
- **THEN** that identity becomes an active super-admin

#### Scenario: non-super-admin cannot create a super-admin
- **WHEN** an identity that does not hold an active `super-admin` role attempts to grant the
  `super-admin` role to any identity, including themselves
- **THEN** the system rejects the request with an authorization error

### Requirement: At least one active super-admin is always preserved
The system SHALL refuse any action — revocation, deactivation, or role change — that would leave the
installation with zero active `super-admin` identities.

#### Scenario: Removing the last super-admin is refused
- **WHEN** an active super-admin attempts to revoke or deactivate the only remaining active super-admin
  (themselves or another)
- **THEN** the system rejects the action and the last active super-admin remains active

#### Scenario: Removing a super-admin when another remains active is allowed
- **WHEN** an active super-admin revokes another super-admin while at least one additional super-admin
  remains active
- **THEN** the action succeeds

### Requirement: At least one active organization-admin is always preserved
The system SHALL refuse any action — revocation, deactivation, or role change — that would leave an
organization with zero active `admin` role assignments.

#### Scenario: Removing the last organization-admin is refused
- **WHEN** an organization `admin` attempts to revoke, deactivate, or change the role of the only
  remaining active `admin` assignment in that organization (themselves or another)
- **THEN** the system rejects the action and the last active organization-admin assignment remains
  active with the `admin` role

#### Scenario: Removing an organization-admin when another remains active is allowed
- **WHEN** an organization `admin` revokes another active `admin` assignment while at least one
  additional active `admin` assignment remains in that organization
- **THEN** the action succeeds

### Requirement: club-admin and referee cannot create or manage users
A user holding only `club-admin` or only `referee` in an organization SHALL have no user-administration
authority: no ability to invite, change the role or status of, or remove any user, and no
user-administration navigation entry. This SHALL follow from those roles not holding the
user-administration capability in the declared mapping, rather than from each user-administration route
omitting them from a list.

#### Scenario: club-admin sees no user-administration entry
- **WHEN** a user holding only the `club-admin` role in an organization opens the Control-web console
- **THEN** no navigation entry for user administration is rendered for that organization

#### Scenario: referee sees no user-administration entry
- **WHEN** a user holding only the `referee` role in an organization opens the Control-web console
- **THEN** no navigation entry for user administration is rendered for that organization

#### Scenario: The restriction follows from the mapping
- **WHEN** a new user-administration route is added
- **THEN** `club-admin` and `referee` are excluded from it because they do not hold the capability, with
  no per-route list to remember to write correctly

### Requirement: User administration is reachable from the acting identity's own admin console
User administration (inviting, changing, and removing role assignments) SHALL be presented as one
section among the other administrative sections the acting identity already has access to, rather than
a standalone route disconnected from those sections: an installation `super-admin` reaches it from the
installation-wide administration console, alongside organization and module management; an
organization `admin` reaches it from their organization's own console, alongside the other
organization-management sections already available to them.

#### Scenario: super-admin reaches user administration from the installation console
- **WHEN** an installation super-admin opens the platform-administration console
- **THEN** a user-administration section is listed alongside organization and module management, without
  navigating to an unrelated, standalone route

#### Scenario: organization-admin reaches user administration from their organization console
- **WHEN** an organization `admin` opens their organization's Control-web console
- **THEN** a user-administration section is listed alongside the other administrative sections already
  visible to that admin

### Requirement: Capabilities and their role mapping are declared in one enumerable place
The system SHALL declare its authorization capabilities as a named, enumerable set, and SHALL declare
which roles hold which capabilities in one place. A route SHALL be guarded by naming the capability it
requires, not by listing the roles that happen to hold it.

The declared mapping SHALL be the only authority: it SHALL be possible to answer "what can this role do"
by reading one declaration, rather than by collecting arguments from every route in the system.

#### Scenario: A role's authority is answerable from one place
- **WHEN** the question "what can a referee do in an organization" is asked of the system
- **THEN** it is answered from the declared mapping, without inspecting any route

#### Scenario: A route names a capability, not a role list
- **WHEN** a route requires authority
- **THEN** it names the capability it needs, and the roles admitted follow from the mapping

#### Scenario: Today's access is preserved
- **WHEN** the mapping replaces the previous per-route role lists
- **THEN** every route admits exactly the roles it admitted before, so no caller gains or loses access
  as a side effect of the declaration

### Requirement: Where one role holds another's authority, it is declared as inheritance
Where a role holds every capability another role holds, that relationship SHALL be declared as
inheritance rather than restated by repeating the junior role's capabilities in the senior role's set.
A capability added to an inherited role SHALL be held by the inheriting role without a second edit.

#### Scenario: Inheritance is expressed once
- **WHEN** an organization administrator holds everything a club administrator holds within the
  organization
- **THEN** that is declared as inheritance, and the club administrator's capabilities are not repeated in
  the organization administrator's declaration

#### Scenario: An added capability propagates
- **WHEN** a capability is added to an inherited role
- **THEN** every role inheriting from it holds the new capability with no further declaration

#### Scenario: Inheritance never crosses an organization boundary
- **WHEN** any role inherits from another
- **THEN** the inherited authority applies only within the organization the assignment belongs to,
  preserving the existing rule that a role in one organization grants nothing in another

### Requirement: club-admin's scope over club-owned resources is defined
The authority a `club-admin` holds SHALL be explicitly scoped: either narrowed to the clubs that
principal administers, on the same resource-ownership basis participant scope already uses, or declared
organization-wide. It SHALL NOT be left undefined, with the role admitted by route lists while nothing
narrows what it may act upon.

#### Scenario: Club scope is enforced where it is declared
- **WHEN** a `club-admin` acts on a resource belonging to a club they do not administer, and club scope
  is the declared model
- **THEN** the action is refused on ownership grounds, the same way participant scope is enforced

#### Scenario: The scope is discoverable
- **WHEN** an operator or a reader asks what a club administrator may act on
- **THEN** the answer is stated by the declared model rather than inferred from which routes happen to
  name the role

### Requirement: tournament-admin holds a defined subset of admin's capabilities, scoped to one tournament
`tournament-admin` SHALL hold every tournament-operational capability — stage, zone and group
management, scheduling, registrations, series declaration and match assignment — and SHALL NOT hold any
organization-wide capability, including user administration, organization settings, club management, or
authority over any tournament other than the one its assignment names.

A `tournament-admin`'s actions SHALL be scoped to the tournament their assignment names, on the same
resource-ownership basis club scope uses. An action against a different tournament in the same
organization SHALL be refused on ownership grounds.

#### Scenario: tournament-admin acts within its own tournament
- **WHEN** a `tournament-admin` creates a stage or manages registrations within the tournament their
  assignment names
- **THEN** the action succeeds on the same terms it would for an organization administrator

#### Scenario: tournament-admin is refused outside its tournament
- **WHEN** a `tournament-admin` attempts an action against a different tournament in the same
  organization
- **THEN** the action is refused on ownership grounds, the same way club scope is enforced

#### Scenario: tournament-admin holds no organization-wide authority
- **WHEN** a `tournament-admin` attempts to invite a user, change organization settings, or manage a
  club
- **THEN** the action is refused, because none of those capabilities are in the role's declared set

### Requirement: The audit trail is readable by an authorized operator
The audit trail SHALL be readable through a surface scoped by the reader's own authority, answering what
happened to a given aggregate, what a given actor did, and what was attempted and refused.

A reader SHALL see only entries within organizations they hold authority in, and reading the trail SHALL
itself require a capability rather than being available to every role. The existing correction-history
view SHALL continue to work unchanged.

#### Scenario: An organization administrator reviews what happened
- **WHEN** an organization administrator opens the audit surface for a tournament
- **THEN** they see the recorded actions against it in chronological order, each naming its actor, the
  time, and whether it was applied or refused

#### Scenario: The trail is scoped to the reader's authority
- **WHEN** an operator holding authority in one organization opens the audit surface
- **THEN** entries from organizations they hold no authority in are not returned

#### Scenario: Reading the trail requires its own authority
- **WHEN** a role that does not hold the audit-reading capability attempts to open the surface
- **THEN** access is refused, and the refusal is itself recorded

#### Scenario: An actor's own activity is answerable
- **WHEN** an administrator asks what a given member did
- **THEN** the surface returns that actor's recorded actions within the administrator's own
  organizations

#### Scenario: Correction history is unaffected
- **WHEN** an operator opens a match's correction history
- **THEN** it renders as it did before the audit surface existed
