---
title: Load match data
description: Bulk/structured entry for a match played with no live console present.
roles:
  - admin
  - referee
---

## What this screen is for

Not every match has an operator at the console while it is being played. This screen lets you enter a
match's roster, its full event history, and its final result together, after the fact — for a club
reporting an away match, or an organizer catching up on a backlog of paper scoresheets.

It only applies to a scheduled match with no prior recorded activity. A match that already has a live
session's events or segments should be finished through the [live console](/help/control/match-console)
instead — loading a second history on top of a live one would conflict with it.

## Key fields

- **Roster**: the same per-entrant player selection the live console offers, kept only on this screen
  until you submit — nothing is saved to the match until the whole batch is.
- **Segments**: every period/half/set the match had, in play order, each already marked complete with
  its duration. There is no live clock here.
- **Events**: the match's full history, in the order it actually happened, each with its own real
  timestamp — not the moment you happen to be entering it.
- **Result**: the match's final result, submitted together with everything above.

## One submission, all or nothing

Pressing "Submit match data" sends the roster, every event, and the result together, in one
transaction. If any single event is invalid, nothing is recorded — the whole submission is refused, and
what you entered stays on the screen so you can fix the one entry that failed and resubmit, rather than
starting over.

## Importing from a spreadsheet

The "Import from CSV" section loads a spreadsheet into the same builder above, for review before
submitting — it never bypasses the review step or the submission's validation. Download the template
for the exact column shape a file needs.
