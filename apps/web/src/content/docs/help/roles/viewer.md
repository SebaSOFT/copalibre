---
title: Viewer
description: What the viewer role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - viewer
---

## What this role is for

The least-privileged organization role — membership in the organization's taxonomy for someone who
should be listed as belonging to it, without granting any operator authority.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

No capabilities are granted to this role today.

<!-- GENERATED:CAPABILITIES:END -->

As with [broadcaster](/help/roles/broadcaster/), this is stated plainly rather than left undocumented:
no route admits viewer to anything the mapping names. Everything genuinely public — live overviews,
published standings, brackets, and profiles — needs no role at all and is reachable by anyone, member or
not.

## What it inherits

Nothing — no role inherits from viewer, and it inherits from none.

## What it cannot do

Everything an organization capability guards, same as broadcaster: no administration, no match
operation, no data access beyond what public reads already expose to a non-member.

## Screens it sees

Every control-panel screen except "Roles" — identical to what broadcaster sees, for the identical
reason.
