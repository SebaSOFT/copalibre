---
title: Tournament authoring
description: What the tournament-creation wizard configures and what each field means.
capabilities:
  - control-web/tournament-authoring
  - tournament-engine/discipline-driven-results
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/tournament-profile
  - tournament-engine/tournament-domain-model
  - tournament-engine/competition-identity
  - tournament-engine/rules-engine
  - tournament-engine/scripting-hook-surface
  - tournament-engine/placement-stage-format
roles:
  - admin
---

## What this screen is for

Creates a new tournament within the organization: choose the discipline, the format, and the basic
data before any participant is registered.

## Key fields

- **Discipline**: the ruleset for the sport/activity being played (win condition, points, segments,
  and so on). Only disciplines installed on this installation appear — if the one you need is
  missing, install it first (`copalibre module add`) before you can create the tournament.
- **Alias**: the tournament's public route identifier, unique within the organization. Uses
  lowercase and hyphens; appears in the public URL and cannot be freely changed afterward.
- **Format**: the competition format available for the chosen discipline (single elimination, round
  robin, and so on).

## Lifecycle

A newly created tournament starts in **draft** state. From there it follows a linear path:
draft → published → started → finished → archived. Each step is an explicit decision on another
screen, never something this screen does for you. Once **started**, the discipline and the
tournament profile freeze at the version they had at that moment — a tournament in progress never
changes its rules midway through.
