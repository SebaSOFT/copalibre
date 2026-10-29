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
  - control-web/tournament-plain-language-summary
  - platform/personal-data-publication
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

## Planning zones

Each stage can be split into zones when you create the tournament. Open **Zones** under a stage, add a zone and name it. A zone plays its stage's format and series unless you pick another format for it (for example, two knockout zones and one round-robin league inside one stage) or give it a series of its own. Zone names must be unique within the stage. The wizard declares the structure only: entrants are assigned to zones after registration, in the zones and groups screen, where the format of each zone can also be changed until the stage has fixtures.

## Reviewing before you create

The wizard's final step summarizes everything configured so far — discipline, format, stages,
registration settings, and any discipline ruleset field you touched — in plain language, before
the "Create" action is available. The same summary appears alongside the editable forms on a
created tournament's Settings and Ruleset screens, always reflecting the last saved state there.

## Lifecycle

A newly created tournament starts in **draft** state. From there it follows a linear path:
draft → published → started → finished → archived. Each step is an explicit decision on another
screen, never something this screen does for you. Once **started**, the discipline and the
tournament profile freeze at the version they had at that moment — a tournament in progress never
changes its rules midway through.

## Minimum rest between matches

A created tournament's **Settings** screen sets the minimum rest, in minutes, between the end of one
of an entrant's matches and the start of their next. It is checked every time this tournament's
matches are previewed or published in the [schedule builder](/help/control/schedule); a placement
leaving less rest is a conflict naming both matches. Leave it empty to apply no rest rule. Changing it
moves no match — it applies from the next preview on.

## Participant public profiles

Open a tournament's **Settings** screen and choose **Privacy**. The organization explicitly marks
whether the tournament includes minors; a person's birth date does not set this choice. Public youth
profiles are a separate setting. When minors are included and youth profiles are disabled, public
surfaces show players by display name only, without photos, nationality or player-page links, and do
not include them in public career pages. Changing these settings is audited. To hide one person's
profile, use the [person profile controls](/help/control/person-profile).
