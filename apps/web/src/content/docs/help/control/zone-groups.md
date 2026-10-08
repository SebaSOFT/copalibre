---
title: Zones and groups
description: Create zones and groups within a stage, and assign entrants to them.
capabilities:
  - control-web/zone-group-management
roles:
  - admin
---

## What this screen is for

Some tournaments split a stage into separate zones (e.g. "Copa Oro" and "Copa Plata"), and each zone
into groups that play a round-robin among themselves. This screen creates those zones and groups, and
assigns entrants to them — either through the same seeded, constraint-satisfying automatic draw used
for bracket seeding, or by placing each entrant manually.

A stage that has never had an explicit zone or group created shows exactly one of each — the implicit
default every stage already has.

## Key fields

- **Zone**: a named subdivision of a stage (e.g. a separate cup within the same stage).
- **Group**: a named subdivision of a zone, playing a round-robin among its own entrants.
- **Automatic draw**: the same deterministic, constraint-satisfying assignment the bracket seeding
  builder and heat-lobby assignment already use — reruns identically given the same seed.
- **Manual placement**: assigning each entrant to a zone or group number directly, recorded exactly as
  an automatic draw's result would be.

## Playing a different format in a zone

By default every zone plays its stage's format. Open **Override zone format** on a zone to give it
its own — for example two knockout zones and one round-robin league for the clubs left over — and, when
the format needs one, its own series length. The screen labels an overridden zone and shows the format
the others inherit; choosing **Stage format** returns a zone to the stage's. The format list is the one
the tournament's discipline offers. Once the stage has fixtures, zone formats and series are locked.

The public stage page then draws each zone the way its format needs: a bracket for a knockout zone, and
the matches with their standings table for a league zone.

## What you cannot do here

Renaming an already-created zone or group is not available yet — name it carefully at creation.
