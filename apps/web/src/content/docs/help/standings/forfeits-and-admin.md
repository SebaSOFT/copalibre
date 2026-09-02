---
title: Forfeits & Administrative Adjustments
description: Handling walkovers, administrative losses, disqualifications, and result corrections in standings.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/rules-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

When matches conclude through circumstances other than ordinary play (e.g. no-shows, disqualifications, or administrative sanctions), CopaLibre applies explicit result reasons and deterministic standings updates.

## Result Reasons

- `walkover`: An opponent fails to appear; victory is awarded to the attending side.
- `administrative-loss`: A loss assigned by official tournament ruling outside play.
- `forfeit-abandonment`: A match that commenced but was abandoned prior to natural completion.
- `disqualified`: Entrant expelled from the competition by referee or governing body.
- `did-not-finish`: Competitor started but withdrew during a multi-participant heat.

## Standings Impact

- A forfeited match awards standard victory points to the non-offending side.
- In Swiss competitions, opponent adjustments prevent non-forfeiting players from suffering unfair Strength-of-Schedule penalties.
- All result corrections are non-destructive and recorded in the audit trail, triggering automated recalculation of downstream tables.
