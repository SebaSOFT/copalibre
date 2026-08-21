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

## Working with an unreliable connection

Pitch-side connectivity drops. This screen is built for that: recording an event, adjusting the
clock, selecting a roster, or finalizing a match writes to a durable local queue _before_ it's
ever sent — so a dropped signal never loses something you already did.

- **Sync status** is always visible at the top of the screen: whether you're online, how many
  actions are still waiting to send, and when the last one actually went through.
- **A queued action stays queued**, not lost, through a spotty connection, a dead zone, or even
  closing and reopening this screen — reopening it resumes sending whatever is still waiting.
- **Once connectivity returns**, everything queued sends automatically, in the order you did it.
- **A refused action** — one the server would have rejected even live, such as a roster change
  submitted after the match already finished — is shown clearly, with the reason, so you know
  exactly what needs your attention. It never blocks anything queued after it.

What this screen does not do: recover typing or a selection you never actually submitted. If you
were mid-edit when the connection dropped, that specific in-progress input is lost the same way it
always was — only actions you already attempted to record are protected.
