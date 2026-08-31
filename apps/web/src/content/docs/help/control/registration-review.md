---
title: Registration review
description: What accepting, rejecting, or withdrawing a registration does, how to import participants by CSV or add one directly, and how to manage a participant's identity link.
capabilities:
  - control-web/registration-review
roles:
  - admin
  - club-admin
---

## What this screen is for

Reviews every participant or team registered before the tournament publishes, and decides whether
each one is accepted, rejected, or withdrawn. Every decision is audited individually with the prior
state, the resulting state, and who made it.

## Key fields

- **Status**: pending, accepted, rejected, or withdrawn. Only valid transitions are allowed from each
  status — the screen does not let you apply an illegal decision (for example, accepting something
  already rejected).
- **CSV import**: upload a participant file; the system validates the content and shows a row-by-row
  preview before confirming. No row with an error is imported until the file is fixed and retried.
- **Bulk review**: applies the same decision to several registrations at once; each one is still
  audited separately, not as a single aggregate event.
- **Entrants needing an abbreviation**: an entrant that collided on every automatically derived short
  label registers with none set, and is otherwise invisible — this section lists those entrants and
  lets you set one directly. A value already used by another entrant in the tournament is rejected
  inline, naming the conflict; a resolved entrant drops off the list.

## Registering directly, without a CSV file

For a single walk-up entrant, adding a person or team directly avoids building a one-row file: name a
display name (and optionally an alias) and it registers through the same path a CSV row takes, with
the same validation and duplicate-recognition rules. A person or team added this way is recognized
later if the same natural key or alias appears in an imported file, rather than creating a duplicate.

Once registered, a person's or team's own identity fields — display name and alias — can be edited
directly, without withdrawing and re-registering them. An edit that would claim an alias already held
by a different person or team in the organization is refused, naming the collision.

## Managing a participant's identity link

A person record can be linked to a login identity (pre-linked by an admin, or by the participant's own
first login). An admin can remove that link — for example, one pre-linked to the wrong email — from
the person's row. Removing the link does not touch the person's registrations, team memberships, or
statistics; it only stops that person resolving to the login identity. A person with no link cannot be
unlinked. Once unlinked, the person can be pre-linked again to the correct identity, with no residue
from the removed link.

## What this screen does NOT do

It does not change match results or the fixture — it is exclusively about who participates, before
the tournament starts.
