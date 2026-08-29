---
title: Registration review
description: What accepting, rejecting, or withdrawing a registration does, and how to import participants by CSV.
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

## What this screen does NOT do

It does not change match results or the fixture — it is exclusively about who participates, before
the tournament starts.
