---
title: Standings Scopes & Head-to-Head
description: Evaluation scopes (overall, head-to-head, match-losses) and recursive sub-tie resolution.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/rules-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

When competitors finish level on primary points, tournament profiles apply tiebreaker pipelines to establish fair rankings. CopaLibre supports multi-scoped evaluation to determine whether metrics apply across all games or only between the tied parties.

## Evaluation Scopes

- **`overall`**: The default scope. Computes the comparator over every match contested in the stage.
- **`head-to-head`**: Restricts calculation exclusively to matches played directly between the tied competitors.
- **`match-losses`**: Filters statistics to only those matches in which the entrant suffered a loss.

## Recursive Sub-Tie Resolution

When three or more entrants tie on points, CopaLibre isolates their direct matches into a head-to-head mini-table. If this resolves one position but leaves remaining competitors tied, CopaLibre recursively constructs a new sub-head-to-head evaluation solely for the tied subgroup.

## Explainability Trace

Every position in the standings table is accompanied by an audit trail detailing the exact comparator, scope, and values that separated competitors.
