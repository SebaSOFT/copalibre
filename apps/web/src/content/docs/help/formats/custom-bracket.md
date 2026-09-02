---
title: Custom DAG Brackets
description: Declarative directed acyclic graphs for asymmetric brackets, bronze finals, and multi-tier knockouts.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

Custom brackets allow tournament operators to define arbitrary elimination trees using a Directed Acyclic Graph (DAG). Whenever a tournament's structure requires asymmetric byes, 3rd place consolation finals, or bespoke repechage pathways, operators configure explicit match nodes and advancement edges.

## Graph Node Declarations

Each match node declares its identifier, round number, and entrant origins:

- `{ seed: N }`: Positions an initial seed directly into the match.
- `{ winnerOf: "matchId" }`: Advances the winning entrant of a previous match.
- `{ loserOf: "matchId" }`: Drops the losing entrant of a previous match into a consolation or lower branch.

## Supported Use Cases

- **3rd Place Consolation Matches**: Semi-final losers play for bronze medals.
- **Asymmetric Knockouts**: Play-in wild card rounds feeding into traditional quarter-finals.
- **Repechage / Second-Chance Ladders**: Traditional combat sports repechage brackets.

## Validation Guarantees

CopaLibre validates that the graph is strictly acyclic, free of orphaned or dangling references, and deterministic in seed placement prior to competition start.
