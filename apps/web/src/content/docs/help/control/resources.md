---
title: Venues & officials
description: List, create, and edit an organization's venues and officials — what the schedule builder assigns.
capabilities:
  - tournament-engine/resource-scheduling
  - design-system/destructive-actions
roles:
  - admin
---

## What this screen is for

An organization's venues and officials are managed here: the resource pool the schedule builder assigns
to a stage's fixtures. Both are reusable across every tournament this organization runs — created once,
assigned as often as needed.

## Key fields

- **Venue name / alias / capacity**: a venue's identity and how many fixtures it can host at once (a
  club with three courts is one venue with a capacity of three, not three venues).
- **Venue details**: free-form, for an operator to read — an address, a playing surface, or for a
  virtual venue (a game server), its address, region, or current map. Never validated or parsed.
- **Official name / roles**: an official's identity and the roles they may be assigned to (referee,
  assistant, table official, observer).

## Removing a venue or schedule

A venue with no schedule assignments can be removed immediately. A success notification offers Undo
for 10 seconds. Clear or move a venue's assignments before removing it. Official deletion is not
available yet; an unused official can be ignored.

Deleting a schedule is irreversible. Its confirmation preview lists the number of slots and assigned
matches that will be removed. Type the schedule name to enable **Delete schedule**.

Assigning a venue or official to a specific fixture happens in the schedule builder, not here.
