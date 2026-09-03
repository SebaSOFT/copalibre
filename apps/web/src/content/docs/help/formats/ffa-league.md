---
title: Multi-Division FFA League
description: Multi-round placement leagues with divisions, lobby scheduling, and cumulative standings.
capabilities:
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/placement-stage-format
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

The FFA League format structures non-elimination multi-round placement competitions. Entrants are organized into independent divisions (e.g. Division 1, Division 2). Over a season of multiple match days, participants contest lobbies each round to accumulate placement and performance points.

## Division Scheduling & Lobby Rotation

- **Divisions**: Can be explicitly defined with designated rosters or partitioned automatically via `divisionCount`.
- **Cyclic Lobby Offset**: When division entrants exceed lobby capacity, a cyclic offset algorithm rotates player lobby assignments across rounds, maximizing opponent variety.
- **Standings**: Cumulative standings are computed independently per division across all completed rounds.
