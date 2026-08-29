---
title: Schedule
description: Assign each match a slot — a declared start time, venue, and duration — and the officials who work it.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## What this screen is for

Every match in a stage is assigned into a slot here — a calendar view and a list view over the same
batch. A slot is not typed in by hand per match: it is a start time, venue, and duration declared once on
the [venues and officials](/help/control/resources) resource pool, and the schedule builder assigns a
match into one, not the other way around. Officials are toggled per match from the same resource pool.

## Match grain, not fixture grain

Scheduling operates on the match, not the cross between two entrants. A single-match fixture has one
match to place; a [series](/help/control/series) of five has five, each with its own slot and its own
officials — the series' fourth and fifth games can sit in reserved slots that are never filled if the
series is decided early, and the builder marks them as no longer required rather than leaving them
looking unscheduled.

## Preview before you publish

Before anything is published, the builder previews the batch and shows every conflict — a double-booked
venue or official, a rest-rule violation — naming the matches involved, and names any already-published
match the batch would move. Publishing is atomic: every assignment in the batch takes effect together, or
none do.

## What you cannot do here

Rescheduling a match that has already finished is refused: its schedule is a record now, not a plan, and
changing it goes through the [audited correction workflow](/help/control/corrections) instead. A match
with no slot assigned is shown explicitly as having no match scheduled — never silently omitted, and
never confused with a bracket bye. Creating or editing a venue or official happens on the
[venues and officials](/help/control/resources) screen, not here.
