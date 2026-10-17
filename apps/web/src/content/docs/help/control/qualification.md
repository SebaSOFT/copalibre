---
title: Qualification
description: Confirm who qualified into a stage generated ahead — previewed, then committed in one step.
capabilities:
  - tournament-engine/stage-qualification
roles:
  - admin
---

## What this screen is for

When a reviewed promotion plan routes qualifiers to a stage, the seeding builder can generate that stage
**ahead**, before the prior stage completes. Its first-round sides then read as qualifier positions
("1st Group A", "2nd best runner-up", "Qualifier 5") and its matches can already be scheduled.

This screen fills those positions. It lists every qualifier position with the entrant the current
standings put there; nothing changes until you confirm.

## Key states

- **Prior stage still open**: the screen counts the unresolved matches. Finishing the last one fills
  nothing by itself.
- **Tie at a cut line**: the screen names the tied entrants and the position they dispute, and offers no
  confirm action until the tie is resolved.
- **Ready**: confirm, and every qualifier side receives its entrant at once. Scheduled slots stay where
  they are.
- **Re-confirm needed**: a result changed after the confirmation. Confirm again while the next stage has
  not started.

## What you cannot do here

You cannot change who qualified by hand: correct the source result instead. Once a match of the next stage
has started, its sides no longer change.
