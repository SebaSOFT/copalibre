---
title: Admin
description: What the admin role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## What this role is for

The organization's own top-level operator. An admin runs everything the organization does: it creates
and publishes tournaments, invites and manages every other user, administers every club, and operates
matches, the same as every other capability in the organization — nothing here is scoped to one club or
one tournament.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (inherited from `club-admin`)
- `org.manage-display-tokens`
- `org.manage-persons`
- `org.manage-registrations`
- `org.manage-resources`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-settings`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-tournament-lifecycle`
- `org.manage-users`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.rebuild-statistics`
- `org.review-reports`
- `org.view-audit-trail`
- `org.view-internal-standings`
- `org.view-internal-tables`

In addition to its own, this role holds every capability `club-admin` holds, by inheritance — a capability added there reaches this role with no second edit here.

<!-- GENERATED:CAPABILITIES:END -->

## What it cannot do

Admin's authority never crosses into another organization — a second organization's admin is a
different assignment entirely, held by nobody until someone invites them there. Admin also holds no
installation-wide authority: creating organizations, managing installation super-admins, and installing
disciplines or tournament-profile modules for the whole installation belong to
[super-admin](/help/roles/super-admin/), a role above admin, not below it.

## Screens it sees

Every control-panel screen for its organization, with no navigation entry hidden — admin is the only
organization role that always sees the "Roles" screen, since user administration (`org.manage-users`)
is its own.
