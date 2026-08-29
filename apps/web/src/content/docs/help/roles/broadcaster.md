---
title: Broadcaster
description: What the broadcaster role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## What this role is for

A grantable role in the organization's taxonomy, intended for someone producing a broadcast around a
tournament rather than administering it.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

No capabilities are granted to this role today.

<!-- GENERATED:CAPABILITIES:END -->

Stated plainly rather than left silent: no route today admits broadcaster to anything the declared
mapping names, so this is what the role actually grants right now, not a placeholder pending
documentation. Public read surfaces — live overviews, published standings and brackets, TV/overlay
routes served by a display token — need no organization role at all and remain reachable regardless of
whether broadcaster is assigned.

## What it inherits

Nothing — no role inherits from broadcaster, and it inherits from none.

## What it cannot do

Everything an organization capability guards: no user, club, or tournament administration, no match
operation, no report review, no data export or import. Assigning broadcaster grants membership in the
organization's taxonomy without granting any operator authority within it.

## Screens it sees

Every control-panel screen except "Roles" — the same navigation a viewer sees, since neither role holds
`org.manage-users`, and neither holds any other capability a screen currently gates on either.
