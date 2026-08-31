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

## What you cannot do here

Renaming an already-created zone or group is not available yet — name it carefully at creation.
