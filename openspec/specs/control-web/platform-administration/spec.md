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
