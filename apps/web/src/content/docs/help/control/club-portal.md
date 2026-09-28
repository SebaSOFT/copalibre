---
title: Club Portal
description: A club administrator's own scoped member directory and tournament roster submission.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## Who this is for

The Club Portal is a self-service workspace for a `club-admin` — a user whose role assignment is
scoped to one specific club, rather than the whole organization. Everything here is bounded to that
one club: a club administrator can never see or change another club's members, teams, or
registrations.

## Member directory

`/control/<organization>/clubs/<club>/portal/members` lists everyone already affiliated with your
club and lets you add a new person (name, and optionally an alias and birth date) or correct an
existing member's name or alias. A member added here belongs to your club from the moment they're
created — there's no separate "assign to club" step.

Nationality, a photo, and other identity details stay an organization administrator's job, exactly as
they are today for any person record.

## Submitting a tournament roster

`/control/<organization>/clubs/<club>/portal/tournaments/<tournament>/roster` walks you through
entering your club into an open tournament:

1. Pick one of your club's existing teams, or create a new one.
2. Select which of your club's members make up the squad, and assign each one a role — player,
   substitute, coach, or staff.
3. Submit. This registers your team as a **pending** entrant with that squad attached — the same
   pending state any registration starts in.

A tournament administrator reviews and approves the registration from their own registration-review
screen; nothing about that step changes because you submitted it yourself. You can always come back
and prepare another team for a different tournament — nothing here is a one-time action.
