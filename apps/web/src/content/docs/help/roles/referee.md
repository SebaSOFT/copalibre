---
title: Referee
description: What the referee role can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## What this role is for

Operating a match while it is live: recording events, controlling the clock, resolving timers, and
selecting a roster — the console an official at the venue uses, without any of the surrounding
tournament administration.

## What it can do

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

Holding `org.operate-match` alone is not the same as being appointed to a specific match — the match
console additionally checks a match-scoped assignment (`MATCH_CAPABILITIES`) before admitting a command,
a narrower authority than the organization role itself grants.

## What it inherits

Nothing — referee holds no other role's capabilities, and no role inherits from referee.

## What it cannot do

Referee cannot correct a finalized match result (`org.correct-match-results` — that is admin's or
tournament-admin's authority, exercised after the match, not during it), and it holds none of the
tournament-setup capabilities: no stage, zone, group, schedule, seeding, or registration authority, no
report review, no user or club administration, no organization settings.

## Screens it sees

Only what `org.operate-match` reaches — chiefly the live match console. Every other control-panel
navigation entry it does see behaves the same as for club-admin and tournament-admin: every screen
except "Roles", since referee never holds `org.manage-users` either.
