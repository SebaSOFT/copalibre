---
title: Super-admin
description: What the super-admin role can do, and what it cannot do.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## What this role is for

The installation's own operator — one level above every organization, not a member of any of them.
Super-admin exists to create organizations, manage who else holds super-admin, and install the
discipline and tournament-profile modules the whole installation runs.

Unlike every other role on this site, super-admin sits outside the organization capability mapping
entirely: it is an installation role (`INSTALLATION_ROLES`), not an organization one
(`ORGANIZATION_ROLES`), so it has no entry in the declared capability-to-role mapping and no generated
capability list here — its authority is a fixed, small set of installation-wide actions, described
directly.

## What it can do

- Create a new organization, naming its alias, display name, primary language and timezone, and invite
  its first administrator in the same step.
- List, create, and remove installation super-admins, by principal ID.
- Drill into any organization's user list, by alias, to change a user's role or status — without needing
  membership in that organization.
- Install a discipline or tournament-profile module by alias, an optional version range, and an optional
  alternate source; list, verify, remove, and check installed modules for updates.
- Author a new discipline or tournament profile through the platform-administration guided builder,
  producing a module package the same installation-wide authority then installs.

## What it cannot do

Nothing reaches into an organization's own tournament data: no fixture, result, or registration is
visible or editable through this role. That is every organization's own control panel, reached by an
[admin](/help/roles/admin/), not by super-admin acting through the installation console.

## Screens it sees

The platform-administration screen, and no other control-panel screen — organization-scoped screens
belong to an organization role, which super-admin does not itself hold merely by being super-admin.
