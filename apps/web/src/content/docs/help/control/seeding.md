---
title: Draw and seeding
description: What seeds, byes, and the draw constraints this screen respects are.
capabilities:
  - tournament-engine/bracket-seeding-builder
  - tournament-engine/draw-constraints
roles:
  - admin
---

## What this screen is for

Builds a stage's draw/bracket: assigns each participant an initial position (a "seed"), respecting
the constraints declared for that discipline/format.

## Key fields

- **Seed**: a participant's seeding position in the bracket — determines who they play first and in
  which round they might meet other high seeds.
- **Bye**: when the number of participants doesn't fill a perfect bracket, some positions "advance"
  without playing. The screen distributes them following the same rule every time, never randomly.
- **Draw constraints**: declared rules (for example, that two participants from the same club don't
  meet in the first round) the draw respects automatically — the screen does not let you save a draw
  that violates them.

## When it can be redone

The draw can be redone as long as the stage hasn't started. Once the stage is underway, redoing the
draw would no longer make sense with matches already played — the screen does not allow it at that
point.
