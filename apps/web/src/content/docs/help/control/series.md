---
title: Multi-match series
description: Declaring a series, what each resolution class does, scheduling its games, and reading one on the public bracket.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## What a series is

A series settles a cross between two entrants with more than one match rather than one. It has no screen
of its own — it is declared on the [tournament authoring](/help/control/tournament-authoring) wizard,
scheduled on the [schedule](/help/control/schedule) screen, recorded match by match on the
[live console](/help/control/match-console) or [loaded](/help/control/load-match-data) after the fact,
and read on the public bracket. A cross that declares no series generates exactly one match and behaves
exactly as it always has.

## Declaring one

A series declares a span (how many matches it can play) and a resolution class:

- **Best of**: the series ends as soon as one side has won enough matches to make the remaining ones
  irrelevant. A best-of span must be odd, so a majority is always possible.
- **Aggregate**: the winner is whoever scored more in total across every match, added together — not
  whoever won more individual matches.
- **Points per leg**: each match awards its own points, and the series winner is whoever accumulates the
  most across every leg.

A series can also be marked as played on neutral ground, and its standings can be counted per match (the
default — every game adds its own win, draw, or loss) or per series (the whole series adds a single
result, however many games it took).

## Scheduling and playing it

Each match in the series gets its own slot and its own officials on the
[schedule](/help/control/schedule) screen. Once the series is decided — a side has clinched a best-of, or
enough legs are unplayable to change the outcome — its remaining games are marked no longer required
rather than left looking unscheduled or abandoned.

## What you cannot do here

A match already played and recorded cannot be un-played by re-declaring the series: correcting a
finalized game of a decided series goes through the
[audited correction workflow](/help/control/corrections), which explicitly blocks a correction from
propagating into a stage that has already started using the series' outcome.
