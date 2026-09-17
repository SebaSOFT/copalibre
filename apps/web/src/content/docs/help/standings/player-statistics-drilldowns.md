---
title: Player Statistics Drilldowns
description: A player's tournament-total and match-by-match breakdown on the public player profile.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Overview

A tournament's public player profile page shows a tournament-total row and a match-by-match
breakdown for every person-granularity ranking layout the tournament's discipline declares — a
spectator switches between declared layouts (e.g. a discipline's own "top scorers" and "assist
leaders" tables) via a labeled selector, without leaving the profile.

## Tournament Total vs. Match Rows

- The **tournament-total** row shows every column kind the layout declares: atomic (collector)
  figures, and any composite or computed ratio derived across the whole tournament (e.g. goals per
  match).
- Each **match row** shows only the layout's atomic (collector-kind) figures for that one match — a
  composite or computed ratio depends on more than one match, so it never appears on a match row.
  Match rows are ordered chronologically by stage then match number, and identify the match by its
  public stage/match number, never an internal identifier.

## When a Player Has No Recorded Statistics

A player with no roster appearance in the tournament's finalized matches sees an explicit empty
state on the tournament-statistics section, rather than a table implying zero-valued matches that
never happened.
