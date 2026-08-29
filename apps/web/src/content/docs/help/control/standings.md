---
title: Standings
description: What a stage's standings table represents and how tiebreakers are explained.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/statistic-collectors
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## What this screen is for

Shows a tournament stage's standings table — who is where and why, with the calculation's
explanation visible, not just the final number.

## Key fields

- **Stage**: a phase of the tournament (for example, "group stage" or "playoffs") with its own
  format and its own table. A tournament can have several chained stages.
- **Points/criteria**: the scoring and tiebreak criteria are the ones the discipline declared — this
  screen never invents its own criterion, it only applies and shows the one that corresponds to the
  configuration in effect at the time it was calculated.
- **Explainability**: every position can be expanded to see exactly which data and which rule
  determined that placement — the decision trail that produced the number, not just the number.

## When it updates

The table reflects already-loaded results and already-applied corrections. A corrected result
recalculates the whole table from the facts currently in effect, never adjusting the number
manually.
