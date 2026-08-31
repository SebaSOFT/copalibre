---
title: Matches view
description: A scannable card list of a tournament's matches — venue, clock, latest event, and standings context — on the public site and in the control panel.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## What this screen is for

Whatever a stage's structure — a single group, several zones, or a multi-match series — it always
reduces to a list of matches to play. This screen is that list, as a card grid: the whole tournament
by default, or narrowed to one stage, one zone/group, or one state (live, upcoming, final) with the
filters at the top. It complements, rather than replaces, the [bracket](/help/control/tournament-authoring)
view — the bracket is the right read for elimination advancement; this is the right read for scanning
volume, especially across several simultaneous round-robin groups a bracket graph has no good way to
show at once.

There are two versions of this screen, sharing the same card:

- **Public** (`/{organization}/tournaments/{tournament}/matches`) — anonymous, no sign-in required.
- **Control panel** (`.../matches-view`) — reachable only by an organization admin or a
  tournament-admin scoped to this tournament, the same authority the internal standings screen
  already requires.

## What each card shows

- **State**: live, upcoming, or final, paired with an icon so the state never depends on color
  alone.
- **Clock**: shown only while the match is in progress — its current elapsed time, the same value
  the live match console reads.
- **Venue**: the assigned venue's name, when scheduling has assigned one.
- **Latest event**: the most recently recorded event, whatever it is — this card never special-cases
  a specific event type, so a discipline that declares a new one (a review confirmation, a
  substitution) appears correctly with no change to this screen.
- **Zone/position, or series state** — never both on the same card:
  - A cross in a zone/group stage with no series declared shows the zone/group name (when the stage
    declares more than the default single one) and each entrant's current standings position.
  - A cross settled by a series shows its progress and, once resolved, its aggregate state instead —
    the same series rendering the [bracket page](/help/control/series) already uses.
- **Deciding factor**: on a finalized match whose result required a tiebreak comparator to separate
  two standings rows, one line naming what decided it (for example, "decided by head-to-head goal
  difference").

## The deciding-factor line vs. the full trace

The public card's deciding-factor line is deliberately a summary, not the full reasoning — it never
carries the internal comparator trace's other steps or intermediate values. An organizer with
authority over this tournament's internal standings (an admin, or a tournament-admin scoped to it)
sees the **full** comparator trace instead, on the control-panel version of this same card, exactly as
the internal standings screen's own trace expander shows it. Nobody sees a version in between: a
viewer either sees the one-line summary or the complete trace, never a partially redacted one.

## What this screen does NOT do

It is read-only. No card or control here changes a match's state, records an event, or edits the
schedule — those actions stay on the [live match console](/help/control/match-console) and the
[schedule](/help/control/schedule) screen. This screen is for scanning what is happening and what
already happened, not for operating a match.
