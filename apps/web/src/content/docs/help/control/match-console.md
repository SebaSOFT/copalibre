---
title: Live match console
description: What the match console does, and what cannot change once a result is loaded.
---

## What this screen is for

This is the operation screen for a match in progress: recording events and segments as they happen,
and loading the final result when the match ends. What happens here broadcasts live to the
tournament's public screen.

## Key fields

- **Event**: a specific match occurrence (a point, a card, a substitution) recorded with its exact
  moment — it forms the match's reconstructible history, not just the final score.
- **Segment**: a division of the match with its own clock (a set, a period). The clock and the result
  are handled per segment, not as a single stopwatch for the whole match.
- **Result**: the match's final result, loaded exactly once. Once loaded, it is not overwritten from
  this screen — any later correction goes through the audited correction/supersession flow, not by
  reloading it here.

## What you cannot do after loading the result

Once the match is finished, this screen no longer lets you keep adding events as if the match were
continuing, nor reload the result directly. That is intentional: it protects the integrity of the
history already published.
