---
title: Schedule
description: Assign a stage's fixtures a time, venue, and officials, preview conflicts, then publish.
---

## What this screen is for

A stage's fixtures are assigned a start time, duration, venue, and officials here — a calendar view and
a list view over the same batch. Nothing is scheduled by an algorithm: every assignment is the
organizer's own choice, built, previewed, then explicitly published.

## Key fields

- **Start time / duration**: when a fixture is reserved to play, and for how long the resource is held —
  not how long the match actually takes, which nobody knows in advance.
- **Venue / officials**: assigned from the organization's [venues and officials](/help/control/resources)
  list.

## Preview before you publish

Before anything is published, the builder previews the batch and shows every conflict — a double-booked
venue or official, a rest-rule violation — naming the fixtures involved, and names any already-published
fixture the batch would move. Publishing is atomic: every assignment in the batch takes effect together,
or none do.

## What you cannot do here

Rescheduling a fixture whose match has already finished is refused: its schedule is a record now, not a
plan, and changing it goes through the audited correction workflow instead. An entrant with no fixture
assigned is shown explicitly as having no match scheduled — never silently omitted, and never confused
with a bracket bye.
