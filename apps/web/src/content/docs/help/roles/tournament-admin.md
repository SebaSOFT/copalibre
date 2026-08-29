---
title: Tournament admin
description: What the tournament-admin role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## What this role is for

Authority to run one tournament — the tournament that assignment names — without organization-wide
reach. An organization that wants someone to run a single competition end to end, and nothing else, uses
this role rather than admin.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.manage-display-tokens`
- `org.manage-registrations`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

<!-- GENERATED:CAPABILITIES:END -->

Every one of these is scoped to the one tournament the assignment names. Acting against a different
tournament in the same organization is refused on ownership grounds, the same way club scope is
enforced for club-admin.

## What it inherits

Nothing. Every capability tournament-admin holds, it holds directly — [admin](/help/roles/admin/) holds
the identical set of tournament-operational capabilities too, unscoped, but as a directly declared set
of its own rather than by inheriting from tournament-admin.

## What it cannot do

No organization-wide authority: tournament-admin cannot invite or manage users, change organization
settings, or manage clubs — `org.manage-users`, `org.manage-settings` and `org.manage-clubs` are never
in its set. It also cannot create a new tournament (`org.create-tournaments`) or change an existing
tournament's lifecycle — publish, archive, or its custom scripts (`org.manage-tournament-lifecycle`):
those stay admin-only, since standing up or retiring a tournament is an organization-level decision, not
a within-tournament one. And it cannot act on any tournament other than the one its assignment names,
even within the same organization.

## Screens it sees

Every control-panel screen this organization's members can see, except "Roles" — the same as
[club-admin](/help/roles/club-admin/), and for the identical reason: user administration needs
`org.manage-users`, which tournament-admin never holds.
