---
title: Club admin
description: What the club-admin role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## What this role is for

Authority over one club: the club that assignment names, and only that club. A club-admin maintains
that club's identity — its name, alias, abbreviation and emblem — without needing organization-wide
administrator access to do it.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Scoped, not organization-wide: a club-admin acting on a club they do not administer is refused, the
same way a participant is refused acting on another participant's records.

## What it inherits

Nothing — club-admin holds no other role's capabilities. [Admin](/help/roles/admin/) inherits
`org.manage-clubs` from club-admin, not the other way around: admin holds everything club-admin holds,
unscoped, in addition to its own.

## What it cannot do

Nothing outside club administration. A club-admin cannot invite or manage users, change organization
settings, create or administer tournaments, review registrations, or operate a match — every one of
those needs a capability this role does not hold. It also cannot act on a club it does not administer,
even within the same organization.

## Screens it sees

Every control-panel screen this organization's members can see, except "Roles" — user administration is
`org.manage-users`, a capability club-admin never holds, so that navigation entry never appears for it.
This follows from the declared mapping, not from a per-screen exclusion list: adding a new
user-administration screen tomorrow excludes club-admin automatically, with nothing to remember to
update here.
