# Platform Administration Specification

## Purpose

Gives an installation-wide super-admin one Control-web screen to create organizations, bootstrap their
first administrator, and manage installed discipline/tournament-profile modules — capability that
already exists at the API layer but has no client today.

## Requirements

### Requirement: Console is reachable only to a super-admin scope holder
The Control-web application SHALL only render the platform-administration route for an authenticated
caller whose token carries `copalibre.super-admin`, and SHALL NOT link to it from any navigation surface
a non-super-admin caller sees.

#### Scenario: A caller without the scope cannot reach the console
- **WHEN** an authenticated organizer without `copalibre.super-admin` is logged into Control-web
- **THEN** no navigation link to the platform-administration route is rendered, and directly navigating
  to its URL redirects away rather than rendering a screen whose actions would all fail server-side

### Requirement: An organization can be created and its first admin bootstrapped in one flow
A super-admin SHALL be able to create a new organization (alias, name, primary language, timezone) and,
in the same guided flow, send the invitation that bootstraps its first administrator, without needing a
second manual step outside the UI.

#### Scenario: Organization creation offers the first-admin invitation immediately
- **WHEN** a super-admin submits a new organization's alias, name, primary language, and timezone
- **THEN** the organization is created, and the console immediately offers a form to invite that
  organization's first administrator by email

#### Scenario: A duplicate alias is reported, not silently retried
- **WHEN** a super-admin submits an organization alias that already exists
- **THEN** the console surfaces the conflict returned by the API and does not create a duplicate or
  silently overwrite the existing organization

### Requirement: Installed modules are listed with their kind, version, and source
The console SHALL list every installed module showing its kind (discipline or tournament-profile),
alias, version, source (curated repository or an alternate, explicitly opted-in source), and
attribution author.

#### Scenario: Both first-party and community-installed modules are distinguishable
- **WHEN** the installed-module list includes both a first-party catalogue module and one installed from
  an allow-listed alternate source
- **THEN** each row's source is visibly distinguishable, matching what the underlying API already
  reports for that module

### Requirement: A super-admin can install, remove, verify, and check for outdated modules
The console SHALL let a super-admin install a module by alias (optionally pinned to a version range,
optionally naming an alternate source), remove an installed module, re-verify every installed module
against the running core version, and check which installed modules have a newer published version —
each action driven by the corresponding existing `admin/modules` endpoint.

#### Scenario: Removing a module referenced by a started tournament is refused with the reason shown
- **WHEN** a super-admin attempts to remove a module the API refuses because a started tournament
  references it
- **THEN** the console surfaces the API's conflict message, naming the referencing tournament(s), rather
  than a generic failure

#### Scenario: The outdated-module check is available without leaving the console
- **WHEN** a super-admin requests the outdated-module check
- **THEN** the console lists every installed module with a newer published version, showing its current
  and latest version and the semver bump kind

### Requirement: Console lists a user-administration section
The platform-administration console SHALL list a user-administration section alongside organization and
module management, showing organization-admin (and, where the super-admin drills into an organization,
club-admin/referee) role assignments across the installation, reusing the same role-management actions
(invite, change, remove) already defined by the roles-permissions capability, rather than requiring
navigation to a separate, disconnected route.

#### Scenario: User-administration section lists organization-admins across organizations
- **WHEN** a super-admin opens the user-administration section of the platform-administration console
- **THEN** the section lists active and inactive `admin` (organization-admin) assignments across every
  organization, each identifying its organization

#### Scenario: Selecting an organization narrows the section to that organization's roles
- **WHEN** a super-admin selects one organization within the user-administration section
- **THEN** the section shows every role assignment (admin, club-admin, referee, broadcaster, viewer) for
  that organization only

### Requirement: Only a super-admin can create a super-admin from the console
The console SHALL offer a "create super-admin" action only to a caller who already holds an active
`super-admin` role, and SHALL NOT expose that action to an organization `admin` or any other role.

#### Scenario: super-admin creates another super-admin from the console
- **WHEN** a super-admin uses the console's create-super-admin action for a given identity
- **THEN** the API request is authorized and, once accepted, the target identity holds an active
  `super-admin` role

#### Scenario: Action is not rendered for a non-super-admin
- **WHEN** an organization `admin` who does not hold `super-admin` views the platform-administration
  console (if reachable at all)
- **THEN** no create-super-admin action is rendered
