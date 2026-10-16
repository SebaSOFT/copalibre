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

## How long a match holds its slot

A placed match occupies its slot's start plus its **estimated duration**: the discipline's regulation
(for example two 25-minute halves, 50 minutes), with the tournament's own segment count applied. A
discipline without a timed regulation (played to sets, for instance) occupies the slot's full length.
The venue also stays held for the schedule's changeover after the match. Short slots therefore never
hide a clash: two 50-minute matches fifteen minutes apart at one court are a venue conflict.

The rest rule comes from the tournament's [settings](/help/control/tournament-authoring): the minimum
rest between the end of an entrant's match and the start of their next. A tournament that declares
none applies no rest rule.

## Changing a published match needs a reason

Moving, re-officiating or withdrawing a match that is already **published** asks why before it
publishes. The prompt lists every changed published match with its old and new time and venue. Give
one reason for the whole batch — pick a common reason, one you used recently, or type your own — or
mark a match as an exception with its own reason (the row's "Different reason" toggle, or select
several rows and mark them together). Publishing stays disabled until every listed match is covered.
The previous slot, venue, start and officials are kept with the reason, the person and the time. A
batch of first placements publishes without asking.

From the keyboard: ↑/↓ move between matches, Space selects, E marks an exception, Enter publishes and
Esc closes: first the open suggestion list, then the dialog.

## Withdrawing a match from its slot

"Withdraw from slot" takes a placed match out of its slot as part of the batch: the preview shows it
unscheduled and lists the slots the batch frees, so another match can take one in the same publish.

## What you cannot do here

Rescheduling a match that has already finished is refused: its schedule is a record now, not a plan, and
changing it goes through the [audited correction workflow](/help/control/corrections) instead. A match
with no slot assigned is shown explicitly as having no match scheduled — never silently omitted, and
never confused with a bracket bye. Creating or editing a venue or official happens on the
[venues and officials](/help/control/resources) screen, not here.
