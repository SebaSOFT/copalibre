---
title: Corrections and offline conflicts
description: Previewing a correction, what a series correction does, and why a queued result against an anulled match is kept, not discarded.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Why a correction is never a direct edit

A calculated result cannot be overwritten. Once a match is finalized, changing it goes through an audited
correction instead — an explicit action recording who made it, when, why, the prior state, and the
resulting state. This is the only path back into a finalized result, from the
[live console](/help/control/match-console), [loaded match data](/help/control/load-match-data), or
[schedule](/help/control/schedule).

## Preview before you apply

A correction previews its own downstream impact before it commits: what standings, tables, and
projections would change if it were applied. Nothing recalculates until the correction is explicitly
confirmed.

A correction does not auto-propagate into a stage that has already started using the result being
corrected — a group-stage result feeding a bracket that has already begun does not silently reshuffle
that bracket. The correction still applies to the record; the downstream stage is flagged for the
organizer's own review rather than rewritten for them.

## Correcting a match of a series

Correcting one match of a [series](/help/control/series) previews its effect on the whole series, not
only on that match — a corrected score can flip which side is leading a best-of, or change an aggregate
total, and the preview shows that before the correction is confirmed.

## Why a queued offline result can be refused and kept

The match console keeps working while offline and sends queued actions once connectivity returns. A
queued result can be refused on reconnection — most often because the match it targets was anulled by a
series decision while the operator was recording offline, and will never be played. That queued item is
not discarded: its full contents stay in the queue, refused, so the operator can judge whether the result
belongs somewhere else — typically as a correction to an earlier game of the same series — rather than
losing what was recorded. A refusal on one item never blocks the rest of the queue from draining.
